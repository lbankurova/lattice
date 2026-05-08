---
name: research-cycle
description: "Research phase — produce, challenge, and validate research. Steps 1-7: research → R1 → incorporate → R2 → evaluate → distill → probe."
---

You are orchestrating the **research phase** of a topic. This cycle produces validated research — challenged by two rounds of peer review, checked for corpus coherence, and probed for cross-system impact.

**Input:** A topic. Auto-detects entry point from state. Accepts `--landscape`, `--novel`.

**Output:** Validated research at `{{lattice.project.research.root}}/{topic}.md`. Next: `/lattice:blueprint-cycle {topic}`.

---

## Execution Mode

**Default: autonomous.** Stop ONLY at critical decision points:
- Landscape branch selection (Step 1: user picks which branches to deep dive)
- FLAWED findings persisting across both peer review rounds (Step 5: genuine disagreement)
- Probe BREAKS or SCIENCE-FLAG (Step 7: cross-system implications)

Everything else proceeds automatically:
- CONDITIONAL peer review findings → auto-accept and incorporate
- SOUND findings → note and proceed
- Single FLAWED in R1 that R2 marks resolved → proceed
- Distill audit results → informational, non-blocking

**Log every auto-decision** to `.lattice/decisions.log`:
```
{timestamp}	research-cycle	AUTO-{action}	{topic}	step:{N}	{what was decided and why}
```

---

## Topic Lock

Acquire at Step 1, release at end of Step 7b, heartbeat on every `current_step` update. Cycle-name passed to acquire script: `research-cycle`. Full protocol (commands, STOP-on-contention, path-based-entry, anti-patterns) at the canonical [topic-lock protocol](../../docs/skills-includes/topic-lock.md).

---

## State & Context

**State file:** `.lattice/cycle-state/{topic}.yaml` — create on first run, update after every step.

```yaml
topic: {topic}
started: {ISO timestamp}
phase: research
current_step: research.1
revision: 1
completed: {}
checkpoints: {}
```

**Revision-checked writes.** See the canonical [revision-checked writes protocol](../../docs/skills-includes/revision-checked-writes.md) — read → work → re-read → write-with-incremented-revision; STOP on mismatch with "State file modified by another agent (expected revision {N}, found {M})." New state files start at `revision: 1`.

**Context discipline — disk is storage, context is RAM.** Before EVERY step:
1. Re-read the state file and decisions log for this topic
2. Re-read the input that step depends on (see pre-load table below)
3. After the step completes, write a checkpoint with key decisions, constraints, and output path

| Step | Re-read before acting |
|------|----------------------|
| 1 | Decisions log, existing research doc (if extending), knowledge files from domain map |
| 2 | Research doc (the actual file — don't rely on context) |
| 3 | Peer review file + decisions log for accept/reject decisions |
| 4 | Updated research doc + R1 review |
| 5 | R1 and R2 review files |
| 6 | Research doc, review files |
| 7 | Research doc, system manifest |

**Checkpoint format** (append to cycle state after each step):
```yaml
checkpoints:
  research.1:
    completed: {ISO timestamp}
    key_decisions: ["chose Hedges' g over Cohen's d — unequal groups"]
    constraints: ["gLower 0.3 is load-bearing — S05 and S11 gate on it"]
    output: "{{lattice.project.research.root}}/{topic}.md"
    next_needs: "peer review needs the doc path only — no context"
```

**Entry detection (no --from flags needed):**
1. State file exists → resume from `current_step`
2. No state file → detect from files:
   - No `{{lattice.project.research.root}}/{topic}.md` → Step 1
   - Research doc exists, no `{{lattice.project.research.peer_reviews}}/{topic}-review.md` → Step 2
   - Review exists, no "Peer Review Notes" section in research doc → Step 3
   - "Peer Review Notes" exists, no `{{lattice.project.research.peer_reviews}}/{topic}-review-r2.md` → Step 4
   - R2 review exists → Step 5
   - Research validated → **Done — run `/lattice:blueprint-cycle {topic}`**

**Decision prompt format** (STOP points only):
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

## Steps

### Step 1: Research

The research skill's Step 0 (corpus load) runs first — reads decisions log, existing research, knowledge files, peer reviews, and distillations. Non-negotiable.

Run `/lattice:research` on the topic. Write to `{{lattice.project.research.root}}/{topic}.md`.

**Gates:**
- Output must contain an "Already Known" section. If missing, corpus load was skipped — send it back.
- **For algorithmic topics** — when the research touches an analytical output or proposes an algorithm in a path listed in `.lattice/algorithm-paths.txt` — output must contain an "Oracle Walk" section per Phase 4 of `commands/lattice/research.md`. The section must identify the reference-card assertion(s) the proposed approach must satisfy (or draft new assertions where none exist), trace expected-vs-actual against the project's generated output, and verdict each algorithmic proposal as `PRODUCES | CANNOT_PRODUCE | AMBIGUOUS`. If missing or if the topic visibly has algorithmic proposals but the section says "Phase 4 skipped", send back to research with: "Add Phase 4 algorithmic oracle walk per `commands/lattice/research.md`." For non-algorithmic topics, the auditable one-line skip per Phase 4 is sufficient.

**If `--landscape`:** Present branch table with coverage scores. **STOP — branch selection is a critical decision point.**

Update state: `current_step: research.2`.

### Step 2: Peer Review — Round 1

**Launch a separate agent. Non-negotiable.** Use the Agent tool with `subagent_type: peer-review` (the registered agent at `.claude/agents/peer-review.md`). Do NOT review in the current context — the research rationale is in your context window and will cause confirmation bias.

Launch with:
- **subagent_type:** `peer-review` — the harness loads the agent's instructions; the orchestrator must NOT inline the skill content into the prompt (that pattern was retired 2026-04-27 after measuring ~10K wasted tokens per launch)
- **prompt:** the doc path ONLY — no reasoning, no rationale, no context. One sentence: "Review the document at `{doc-path}` per the peer-review protocol."
- **Output:** `{{lattice.project.research.peer_reviews}}/{topic}-review.md` (the agent writes this directly)

**Gate check:** After the agent returns, read the review and verify:
1. At least one finding rated CONDITIONAL or FLAWED. All-SOUND is suspicious — re-read. If genuinely substantive, accept. If shallow, re-launch with: "Look harder — specifically at assumptions, failure modes, and literature conflicts."
2. Each finding has specific evidence, not just a verdict label.
3. Review addresses at least 3 of 5 dimensions: assumptions, logic chain, alternatives, failure modes, literature.
{{include:optional:project.skills.research_cycle.novel_verification_gate}}

**Auto-handle:** SOUND → note. CONDITIONAL → auto-accept. FLAWED → accept for incorporation.

Update state: `current_step: research.3`.

### Step 3: Incorporate Feedback

For each accepted finding:
- **FLAWED:** Rewrite the affected section with corrected science
- **CONDITIONAL:** Add evidence, narrow assumptions, or acknowledge limitations
- **Rejected:** Note counter-evidence in a "Peer Review Notes" section

The "Peer Review Notes" section is the content marker that incorporation happened.

Update state: `current_step: research.4`.

### Step 4: Peer Review — Round 2

**Fresh separate agent** (not the R1 agent). Use `subagent_type: peer-review` again — the harness gives a clean context per launch. Add `--novel` if flagged.

Launch with:
- **subagent_type:** `peer-review`
- **prompt:** the updated doc path AND R1 review path; one sentence: "Review the document at `{doc-path}`. Read R1 review at `{r1-path}` first; check revisions addressed R1 findings, check for new issues from revisions, do NOT re-raise addressed findings.{` Use --novel mode.` if flagged}"
- **Output:** `{{lattice.project.research.peer_reviews}}/{topic}-review-r2.md` (the agent writes this directly)

Same gate check as Step 2.

Update state: `current_step: research.5`.

### Step 5: Evaluate

| R2 outcome | Action |
|------------|--------|
| All SOUND or CONDITIONAL | Validated — proceed autonomously to Step 6 |
| New FLAWED on previously-SOUND | Arbiter classifies each finding (PRESENTATION_ONLY / FACTUAL_DISPUTE / FACTUAL_UNSUPPORTED). Presentation-only or unsupported objections auto-side with R1. Only testable factual disputes **STOP** and surface the specific disputed claim + R2 evidence. |
| Same FLAWED both rounds | Arbiter diffs claimed evidence items per side (VERIFIABLE vs UNVERIFIABLE). auto_resolve_r1 / auto_resolve_r2 / auto_synthesize outcomes proceed with logged rationale; only escalate_contradiction (both sides have verifiable evidence that directly contradicts) **STOPS** and surfaces the specific contradiction. |

Update state: `current_step: research.6`.

### Step 6: Summary + Corpus Coherence

Present research summary:
```
## Research Validated: {topic}

**Doc:** {{lattice.project.research.root}}/{topic}.md
**Reviews:** {topic}-review.md, {topic}-review-r2.md
**Findings incorporated:** [list]
**Auto-decisions:** [list from log]
**Unresolved:** [list or "none"]
```

Run `/lattice:distill --audit` scoped to this topic. If contradictions found, note in "Corpus Integration" section — these become blueprint-cycle inputs.

Proceed autonomously (distill results are informational, not blocking).

Update state: `current_step: research.7`.

### Step 7: Probe

Run `/lattice:probe` on the validated research findings. Input: research doc path + summary of key findings/decisions.

| Probe result | Action |
|---|---|
| All SAFE/PROPAGATES | Research phase complete |
| Any BREAKS | **STOP** — present implications, build plan must account for them |
| Any SCIENCE-FLAG | **STOP** — present to user before proceeding |
| Any STALE | Note for manifest update, non-blocking |

Update state: `phase: research-complete, current_step: build.0`.

---

### Step 7b: Verify Gap Persistence

Before declaring research complete, verify all gaps from the cycle are persisted:

1. **Read `{{lattice.project.research.registry}}`** — confirm gaps from:
   - Research (Phase 2 gap analysis, Phase 2b uniformity assumptions)
   - Peer review R1 and R2 (CONDITIONAL/FLAWED findings implying gaps)
   - Distill audit (if contradictions found in Step 6)
   - Probe (BREAKS/SCIENCE-FLAG findings from Step 7)
   
   If any gap was mentioned in research/review output but has no REGISTRY entry, write it now.

2. **Read `{{lattice.project.backlog.todo}}`** — confirm data gaps from research and probe STALE findings are logged.

**Gaps discovered during research are the INPUTS to blueprint-cycle prioritization. If they're not in the registry and TODO, the build plan will be built without them.**

Update state: `current_step: research.complete`.

**Release the topic lock:**
```bash
bash scripts/release-topic-lock.sh {topic}
```

## Research Phase Complete

```
Research validated: {topic}
Gaps persisted: {N} research ({{lattice.project.research.registry}}), {N} data ({{lattice.project.backlog.todo}})
Next: /lattice:blueprint-cycle {topic}
```

---

## Key Rules

1. **Peer review runs in a separate agent. No exceptions.** Self-review doesn't work — the rationale is in your context window.
2. **Don't skip Round 2.** Even if R1 was clean, R2 validates the revisions.
3. **2 rounds max per artifact.** Unresolved → escalate to user. No Round 3.
4. **All outputs persist to disk.** Terminal crashes lose nothing.
5. **Gate checks are non-negotiable.** Peer review quality check and corpus load gate are not optional.
6. **Update state after every step.** The cycle state file is the source of truth.
7. **Log every auto-decision.** The decisions log is the audit trail.
8. **Distill is wired, not optional** (Step 6). Prevents new research from contradicting existing corpus.
9. **Probe is wired, not optional** (Step 7). Prevents build plans from ignoring cross-system implications.
10. **Topic lock is mandatory.** Acquire before work, release on completion, heartbeat on every checkpoint. Prevents duplicate concurrent work on the same topic.
