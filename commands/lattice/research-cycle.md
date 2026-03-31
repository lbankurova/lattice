---
name: research-cycle
description: Orchestrate the full research → peer-review → incorporate → peer-review loop. Enter at any step.
---

You are orchestrating a research cycle. This skill runs a produce → review → incorporate → review loop that applies to ANY artifact (research doc, synthesis plan, implementation spec). Enter at any step, run forward from there.

**Input:** A topic/doc path and optional `--from {step}`.

## Entry Points

Detect the right entry point from context, or use `--from`:

| Entry | When to use | Starts at |
|-------|-------------|-----------|
| `--from research` | New topic, no existing doc | Step 1 → 2 → 3 → 4 → 5 → 6 |
| `--from review` | Doc exists, needs peer review | Step 2 → 3 → 4 → 5 → 6 |
| `--from incorporate` | Peer review done, needs incorporation | Step 3 → 4 → 5 → 6 |
| `--from r2` | Feedback incorporated, needs Round 2 review | Step 4 → 5 → 6 |
| `--from synthesize` | Research validated, needs synthesis | Step 7 → 8 → 9 → 10 → 11 |
| `--from plan-review` | Synthesis done, plan needs review | Step 8 → 9 → 10 → 11 |

**Auto-detection:** If no `--from` flag, detect from existing files:
1. No `docs/_internal/research/{topic}.md` → `--from research`
2. Research doc exists, no `peer-reviews/{topic}-review.md` → `--from review`
3. `{topic}-review.md` exists, no "Peer Review Notes" section in research doc → `--from incorporate` (ask user to accept/reject first)
4. Research doc has "Peer Review Notes" section, no `{topic}-review-r2.md` → `--from r2`
5. `{topic}-review-r2.md` exists, no `docs/_internal/incoming/{topic}-synthesis.md` → `--from synthesize`
6. Synthesis exists, no `peer-reviews/{topic}-synthesis-review.md` → `--from plan-review`

**Detection uses file existence and content markers, not timestamps.** The "Peer Review Notes" section in the research doc is the marker that incorporation happened.

Also accepts:
- `--landscape` or `--deep {branch}` for research tier
- `--novel` to run Round 2 peer review in novel source mode

---

## Research Loop (Steps 1-6)

### Step 1: Research

Run `/lattice:research` on the topic. If a research doc already exists with unaddressed peer review findings, incorporate those first (Step 3).

Write output to `docs/_internal/research/{topic}.md`.

**If `--landscape`:** Present branch recommendations and **WAIT** for user to select branches. Deep dive on selected branches, then continue.

### Step 2: Peer Review — Round 1

**Launch a separate agent.** Do NOT review your own work.

Launch with:
- **Prompt:** Full `/lattice:peer-review` skill instructions from `.claude/commands/lattice/peer-review.md`
- **Input:** The doc path ONLY — no reasoning, no rationale, no context
- **Output:** `docs/_internal/research/peer-reviews/{topic}-review.md`

Present review summary to user. **WAIT** for accept/reject.

### Step 3: Incorporate Feedback

**If entering here from a previous session** (`--from incorporate`): the user's accept/reject decisions from Step 2 are not in context. Read the peer review file, present a summary of its findings, and **WAIT** for the user to accept/reject before incorporating. Do not assume all findings are accepted.

For each accepted finding:
- **FLAWED:** Rewrite the affected section with corrected science
- **CONDITIONAL:** Add evidence, narrow assumptions, or acknowledge limitations
- **Plausible alternatives:** Add as acknowledged alternatives

For rejected findings: note user's counter-evidence in a "Peer Review Notes" section.

Update the doc. Mark revised sections. The "Peer Review Notes" section is the content marker that incorporation happened — auto-detection uses this.

### Step 4: Peer Review — Round 2

**Launch a fresh separate agent** (not the Round 1 agent).

**If `--novel` flag was passed:** add `--novel` to the peer review prompt. This forces the Round 2 reviewer to use different sources than Round 1 — recent, niche, underindexed work. If `--novel` was not passed, Round 2 uses standard mode.

Launch with:
- **Prompt:** Full `/lattice:peer-review` instructions (add `--novel` if flagged)
- **Input:** Updated doc path AND Round 1 review path
- **Focus:** "Check revisions addressed R1 findings. Check for new issues from revisions. Don't re-raise addressed findings."
- **Output:** `docs/_internal/research/peer-reviews/{topic}-review-r2.md` (or `{topic}-review-r2-novel.md` if novel mode)

### Step 5: Evaluate

| Round 2 outcome | Action |
|-----------------|--------|
| All SOUND or CONDITIONAL | Validated — proceed to Step 6 |
| New FLAWED on previously-SOUND | Bikeshedding — present both positions. **WAIT.** |
| Same FLAWED both rounds | Genuine disagreement — present both with evidence. **WAIT.** |

### Step 6: Research Summary

```
## Research Validated: {topic}

**Doc:** docs/_internal/research/{topic}.md
**Reviews:** {topic}-review.md, {topic}-review-r2.md
**Findings incorporated:** [list]
**User decisions:** [list]
**Unresolved:** [list or "none"]

Next: /lattice:research-cycle {topic} --from synthesize
```

**WAIT** — user decides whether to proceed to synthesis or stop here.

---

## Synthesis Loop (Steps 7-11)

### Step 7: Synthesize

Run `/lattice:synthesize` on the validated research doc. Provide the synthesize skill with:
- Research doc: `docs/_internal/research/{topic}.md`
- Peer review R1: `docs/_internal/research/peer-reviews/{topic}-review.md` (if exists)
- Peer review R2: `docs/_internal/research/peer-reviews/{topic}-review-r2.md` (if exists)

The synthesize skill reads these to understand what was challenged and how the research was refined. This prevents the synthesis from re-introducing conclusions that peer review corrected.

Write output to `docs/_internal/incoming/{topic}-synthesis.md` with three sections: Build Plan, Research Gaps, Data Gaps.

### Step 8: Plan Review — Round 1

**Launch a separate agent.** Same rules as Step 2.

Launch with:
- **Prompt:** Full `/lattice:peer-review` instructions (it will auto-detect "implementation plan" tier)
- **Input:** The synthesis doc path ONLY
- **Output:** `docs/_internal/research/peer-reviews/{topic}-synthesis-review.md`

Present review summary to user. **WAIT** for accept/reject.

### Step 9: Incorporate Plan Feedback

Same as Step 3 but on the synthesis doc. Fix FLAWED decisions, address CONDITIONAL items, note rejected findings.

Update `docs/_internal/incoming/{topic}-synthesis.md`.

### Step 10: Plan Review — Round 2

**Launch fresh separate agent.**

Launch with:
- **Input:** Updated synthesis doc AND Round 1 plan review
- **Output:** `docs/_internal/research/peer-reviews/{topic}-synthesis-review-r2.md`

### Step 11: Final Summary

```
## Cycle Complete: {topic}

**Research:** docs/_internal/research/{topic}.md (validated)
**Synthesis:** docs/_internal/incoming/{topic}-synthesis.md (validated)
**All reviews:** [list of review files]

### Build Plan — ready for implementation
[summary of what to build]

### Research Gaps — next /lattice:research cycle
[list]

### Data Gaps — backlog
[list]

Next: /lattice:spike or spec-driven implementation
```

---

## Key Rules

1. **Peer review runs in a separate agent. No exceptions.** Self-review doesn't work — the rationale is in your context window. Same principle as `/lattice:review` Step 1b.

2. **Don't skip Round 2.** Even if Round 1 was clean, Round 2 validates the revisions.

3. **2 rounds max per artifact.** Unresolved → escalate to user. No Round 3.

4. **All outputs persist to disk.** Terminal crashes lose nothing.

5. **WAIT checkpoints are real waits.** User decides what to accept and when to proceed.

6. **Entry points are flexible.** The cycle picks up wherever the artifacts left off. No need to restart from scratch.
