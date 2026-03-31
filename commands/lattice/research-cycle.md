---
name: research-cycle
description: Orchestrate the full research → peer-review → incorporate → peer-review loop automatically.
---

You are orchestrating a complete research cycle. This skill runs the full loop from WORKFLOW.md automatically — you do NOT wait for user input between steps (except at the checkpoints marked WAIT below).

**Input:** A topic and optional mode (`--landscape` or `--deep {branch}`).

## The Loop

### Step 1: Research

Run `/lattice:research` on the topic. If a research doc already exists and has unaddressed peer review findings, incorporate those first (see Step 3).

Write output to `docs/_internal/research/{topic}.md`.

**If `--landscape`:** After writing the landscape, present the branch recommendations and **WAIT** for user to select branches. Then proceed with deep dives on selected branches before continuing to Step 2.

### Step 2: Peer Review — Round 1

Without pausing, immediately run `/lattice:peer-review` on the research doc you just wrote.

Important: You are switching roles. When running peer review, you have **no memory of the research rationale.** Read ONLY the research document. Do not carry over your reasoning from Step 1. If you catch yourself thinking "but I wrote that because..." — stop. That's confirmation bias.

Write output to `docs/_internal/research/peer-reviews/{topic}-review.md`.

Present the peer review summary to the user. **WAIT** for user to accept/reject findings. User may say:
- "agree with all" → incorporate all
- "agree with 1, 3, 5 — disagree with 2, 4" → incorporate selected
- "disagree, here's why: ..." → note user's counter-evidence

### Step 3: Incorporate Feedback

Re-read the research doc AND the peer review. For each accepted finding:

- **FLAWED items:** Fix the material error. Rewrite the affected section with corrected science.
- **CONDITIONAL items:** Address the condition. Add evidence, narrow the assumption, or acknowledge the limitation explicitly.
- **Alternative hypotheses rated "plausible":** Add them to the research as acknowledged alternatives, not dismissed.

For each rejected finding (user disagreed):
- Note the user's counter-evidence in the research doc under a "Peer Review Notes" section.

Update `docs/_internal/research/{topic}.md` with the revisions. Mark which sections were revised and why.

### Step 4: Peer Review — Round 2

Run `/lattice:peer-review` again on the **updated** research doc. This time:
- Focus on the revised sections — did the fixes actually address the Round 1 findings?
- Check for new issues introduced by the revisions.
- Do NOT re-raise Round 1 findings that were addressed (unless the fix introduced a new problem).

Write output to `docs/_internal/research/peer-reviews/{topic}-review-r2.md`.

### Step 5: Evaluate

| Round 2 outcome | Action |
|-----------------|--------|
| All material items SOUND or CONDITIONAL | Research is validated. Proceed to summary. |
| New FLAWED on previously-SOUND items | Likely bikeshedding. Present both positions to user. **WAIT.** |
| Same item FLAWED in both rounds | Genuine disagreement. Present both positions with evidence to user. **WAIT.** |

### Step 6: Summary

Present the final state:

```
## Research Cycle Complete: {topic}

**Status:** [Validated / Escalated to user]
**Rounds:** 2
**Research doc:** docs/_internal/research/{topic}.md
**Peer reviews:** {topic}-review.md, {topic}-review-r2.md

### Findings Incorporated
- [list of Round 1 findings that were addressed]

### User Decisions
- [list of findings user rejected with their reasoning]

### Unresolved (if any)
- [items escalated to user]

### Next Step
- Ready for `/lattice:synthesize docs/_internal/research/{topic}.md`
- OR: additional research needed on [specific sub-topic]
```

## Key Rules

1. **Role separation is mandatory.** When switching from researcher to reviewer, you MUST forget your research rationale. Read only the document. This is the hardest part — your natural inclination is to defend what you wrote. Fight it.

2. **Don't skip Round 2.** Even if Round 1 had no FLAWED items, Round 2 checks whether the CONDITIONAL items were adequately addressed. It also catches issues in the revisions themselves.

3. **2 rounds maximum.** If Round 2 doesn't resolve it, escalate. No Round 3.

4. **All outputs persist to disk.** Every research doc, every peer review, every revision. Terminal crashes lose nothing.

5. **WAIT checkpoints are real waits.** Do not auto-proceed past them. The user decides which findings to accept and which branches to explore.
