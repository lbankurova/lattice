# Lattice Framework — Deck Outline

> Narrative arc: each capability was added because the previous set broke in a specific, observed way. Not theory — incidents.

---

## Slide 1: Title

**Lattice: What happens when you let LLMs build a scientific app for 4 months**

Subtitle: An evolving framework for LLM-assisted development — what works, what doesn't, and why it's structured this way.

---

## Slide 2: The product

SENDEX — a web app for exploring pre-clinical regulatory study data (SEND format). FastAPI + React. ~170K lines of code (72K Python + 100K TypeScript). 25 subsystems. 13 validated studies. One developer + Claude.

The interesting part isn't the app. It's what we learned about how LLMs fail at sustained development — and how to make them stop failing.

---

## Slide 3: Starting point — just skills (Mar 28)

**What we had:** Markdown prompt files. `/research`, `/implement`, `/review`. Tell the LLM what to do, it does it.

```
User: /lattice:research {topic}
       -> LLM reads prompt, does research, writes output

User: /lattice:implement {spec}
       -> LLM reads spec, writes code

User: /lattice:review
       -> LLM reviews its own code, commits
```

**This worked for:** Simple features. One-shot tasks. Known territory.

---

## Slide 4: Problem 1 — Self-review is worthless

**What happened:** The LLM reviews code it just wrote. The rationale for every decision is in its context window. It literally cannot see its own blind spots. Reviews pass with "LGTM" when there are real issues.

**The fix:** Independent context. Peer review, architect review, and decision audit each run in a **separate agent** with no access to the main conversation. The reviewer sees only the artifact, not the reasoning that produced it.

```
/lattice:peer-review     -> separate agent, challenges research
/lattice:architect       -> separate agent, checks overengineering
decision-auditor agent   -> separate agent, checks merit (rule 12-13)
```

**Lesson:** LLMs can review. They can't review themselves. Context is the enemy of objectivity.

---

## Slide 5: Problem 2 — Research piles up, nobody synthesizes

**What happened:** After 20+ research files on different topics, the LLM would research something we already knew, or contradict a prior finding without realizing it. Each research session starts fresh — no memory of the corpus.

**The fix:** `/lattice:distill` — corpus-level reasoning across ALL accumulated research. Four modes:
- Answer a question from what we already know
- Build an evidence chain for a claim (thesis mode)
- Check if documentation matches decided research (audit mode)
- Map knowledge to a new domain (adapt mode)

Every claim is tagged by evidence tier: decided > peer-reviewed > unreviewed > cross-document inference.

**Lesson:** Research without synthesis is trivia collection. The value is in connections between findings.

---

## Slide 6: Problem 3 — Fixing a bug doesn't prevent the next one

**What happened:** LLM fixes a bug in module A. The exact same pattern exists in modules B, C, D. Nobody checks. Same bug surfaces again two days later in module B.

**The fix:** `/ops:bug-stress` — mandatory post-fix QC:
1. Classify the bug into one of 10 pattern families
2. Search the ENTIRE codebase for the same pattern
3. Fix ALL instances, not just the one reported
4. Add tests that catch the pattern going forward (grow the oracle)

3+ bugs in the same family -> extract a pattern test suite.

**Lesson:** A bug is never just one bug. It's a pattern with N instances. Fix the class, not the instance.

---

## Slide 7: Problem 4 — The human is the bottleneck

**What happened:** Each cycle (research -> peer review -> incorporate -> review again -> synthesize -> architect gate -> implement -> review -> commit) requires the human to invoke ~8 skills in the right order, make routing decisions, and remember where they left off.

**The fix:** Orchestrators. Three phase-scoped cycles that auto-detect entry points and run autonomously:

```
/lattice:cycle {topic}           -> detects phase, dispatches to:
  /lattice:research-cycle        -> 7 steps, 2 peer review rounds
  /lattice:blueprint-cycle       -> 7 steps, architect gate + 2 plan reviews
  /lattice:build-cycle           -> 4 steps, E2E gate + quality review
```

The human's role shifts from "invoke the next step" to "make the hard decisions" (SCIENCE-FLAG, REJECT, genuine disagreements).

**Lesson:** Orchestration is the leverage point. Individual skills are commodities — the workflow between them is where quality lives.

---

## Slide 8: Problem 5 — Prose rules don't work

**What happened:** CLAUDE.md says "run validation before committing." The LLM skips it 40% of the time. Not maliciously — it just gets focused on the task and forgets. Rules written as prose are suggestions, not constraints.

**The fix:** Mechanical enforcement. If the machine can skip it, the machine will skip it.

| Prose rule | Enforcement |
|-----------|-------------|
| "Review before committing" | Pre-commit hook BLOCKS without review gate file |
| "Don't add Co-Authored-By" | PostToolUse hook BLOCKS writes containing it |
| "Tag commits with Topic:" | PreToolUse hook WARNS on missing trailer |
| "Check validation scores" | Pre-commit hook BLOCKS if engine files changed without ratchet |
| "Don't skip peer review" | Orchestrator checks output quality — re-launches on failure |

**Lesson:** Honor-system rules fail. Hooks, gates, and locks succeed. If you care about a constraint, make it mechanical.

---

## Slide 9: The YAML DAG layer (Apr 10)

**Why:** Skills are prompts. Orchestrators are prompts that call other prompts. But prompts can't be versioned, diffed, tested, or run by different executors.

**The fix:** Define workflow structure as YAML DAGs. Markdown skills define WHAT each node does. YAML defines WHEN it runs, what depends on what, and how routing works.

```yaml
nodes:
  research:
    type: skill
    skill: lattice/research
    checkpoint: { state_key: research.1, phase: research }

  peer-review-r1:
    type: skill
    skill: lattice/peer-review
    depends_on: [research]
    context: fresh           # separate agent — no context leak

  evaluate:
    type: gate
    depends_on: [peer-review-r1]
    evaluate:
      - condition: "{{nodes.peer-review-r1.output}}.contains('FLAWED')"
        route: escalate
      - condition: default
        route: incorporate
```

5 node types: `bash`, `skill`, `gate`, `approval`, `parallel`.

**Lesson:** Separate orchestration structure from agent behavior. Same workflow, different executors (CLI today, Slack tomorrow, CI next).

---

## Slide 10: Problem 6 — Parallel topics conflict silently

**What happened:** Topic A and Topic B both modify the scoring engine (subsystem S10). Topic A's blueprint was validated before Topic B's research discovered a new requirement. Neither knows about the other. Both build. One overwrites the other's work.

**The fix:** Coherence engine — portfolio-level conflict detection.

5 conflict types:
- **Subsystem overlap** — two topics touch the same subsystem
- **Stale blueprint** — blueprint validated before newer relevant research
- **Unresolved cascade** — science flag in topic A propagates to topic B's subsystems
- **Prerequisite violation** — topic B depends on topic A which hasn't finished
- **Science flag propagation** — analytical output changes ripple across topics

Before advancing any topic, the engine checks all active states.

**Lesson:** Single-topic quality gates are necessary but insufficient. Portfolio-level awareness is what prevents integration disasters.

---

## Slide 11: Autopilot — the endgame (Apr 10-16)

**What it does:** Reads all cycle states, runs coherence, auto-resolves what it can, advances safe topics, collects hard decisions into a batch for the human.

**Autonomous** (no human needed):
- Classification (full/spike/bugfix)
- Phase transitions
- CONDITIONAL findings (auto-accept)
- Architect SIMPLIFY (auto-apply)
- Bikeshed detection (side with R1)

**Stops for human:**
- SCIENCE-FLAG (analytical output changes)
- Persistent FLAWED (genuine disagreement across both review rounds)
- BREAKS (system integrity)
- Architect REJECT
- Validation degradation

**The auto-resolve layer:** Some coherence conflicts CAN be resolved by running a targeted distill analysis. "Do these two topics actually conflict, or do they just touch the same subsystem in compatible ways?" Three conflict types are auto-resolvable; two (prerequisite, BREAKS) are always human.

---

## Slide 12: State reconciliation — trust git, not files

**What happened:** Cycle-state YAML files drift from reality. An agent crashes, another agent commits without updating state, someone manually edits a file.

**The fix:** Truth lives in git, not in YAML. Every commit carries a `Topic:` trailer. The reconciliation engine greps `git log`, compares against state files, auto-corrects drift. `lattice status` runs reconciliation first, always.

```
feat: continuous HCD percentile in D4 confidence dimension

Topic: hcd-informed-z-scoring
Phase: complete
```

**Lesson:** Derived state > stored state. If you can reconstruct it from the commit history, do that instead of maintaining a separate file.

---

## Slide 13: Cost tracking — the pre-headless requirement (Apr 17)

**Why:** Headless mode (running on a VPS with no human) is coming. Without cost tracking, that's a blank check.

**How:** Switch Claude CLI from `--output-format text` to `--output-format json`. Parse real `cost_usd` and token counts from every skill execution. Accumulate per-node, per-workflow, per-topic. Budget limits in `.lattice/budget.yaml`.

```
[research]  OK ($1.2340)
[implement] OK ($3.8421)
...
Cost: $5.0761
Tokens: 85.2K in / 42.1K out
```

Budget exceeded -> workflow stops. Not a suggestion — a hard stop.

---

## Slide 14: E2E testing gate — "it builds" is not "it works"

**What happened:** Build passes, tests pass, review passes. But the actual behavior changed in a way nobody tested for. A scoring formula tweak that "simplified" the code actually changed 15% of signal detection results.

**The fix:** Branch-comparison E2E testing. Run the test suite on the base state AND the changed state. Compare. Three auto-detected modes:
- Feature branch vs base branch
- Uncommitted changes (stash, run clean, compare)
- HEAD~1 vs HEAD (after committing on trunk)

Complements the validation ratchet (which checks analytical scores). E2E checks behavioral equivalence.

---

## Slide 15: The architecture — what exists today

```
17 process rules (CLAUDE.md)
21 skills (commands/lattice/)
 6 ops commands (commands/ops/)
 3 independent reviewer agents
 7 YAML workflow DAGs
14 executor modules (TypeScript)
 9 shell scripts (locking, sync, validation)
13 enforcement mechanisms
```

Everything traces back to an observed failure:
- Self-review doesn't work -> independent agents
- Research doesn't compound -> distill
- Bugs recur -> bug-stress
- Humans are bottlenecks -> orchestrators
- Prose rules fail -> mechanical enforcement
- Parallel work conflicts -> coherence engine
- State files drift -> git-based reconciliation
- "It builds" lies -> E2E gate + validation ratchet
- Unattended = blank check -> cost tracking + budgets

---

## Slide 16: What actually works (empirical, not theoretical)

1. **Independent context for review.** Single most impactful change. Catches real issues that self-review misses 100% of the time.

2. **Mechanical enforcement > prose rules.** Pre-commit hooks, gate files consumed after use, locks with stale recovery. If it can be skipped, it will be.

3. **YAML DAGs for orchestration.** Separate structure from behavior. Versionable, diffable, executable by different platforms.

4. **Portfolio-level awareness.** Single-topic quality is table stakes. Cross-topic coherence is what prevents "it all worked individually but broke together."

5. **Git as source of truth for state.** Commit trailers + reconciliation > manually maintained state files.

6. **Two-round peer review with a hard cap.** Round 3 is always bikeshedding. Escalate to human after 2.

---

## Slide 17: What doesn't work (or hasn't yet)

1. **LLM self-assessment of any kind.** Doesn't work for review, doesn't work for estimating quality, doesn't work for judging whether a rule was followed. Always use a separate agent or a mechanical check.

2. **Natural language constraints.** "You should always..." gets ignored under cognitive load. Convert to hooks or gate checks.

3. **Stored state without reconciliation.** Any file that the LLM maintains (state, indexes, manifests) will drift. Either derive it from git or reconcile constantly.

4. **One-shot bug fixes.** The LLM fixes the symptom, not the pattern. Bug-stress (search for same pattern everywhere) is the only reliable approach.

5. **Cost estimation without measurement.** Token counts vary 10x for "similar" tasks. Real measurement (JSON output parsing) is the only approach that works.

---

## Slide 18: The meta-lesson

The framework isn't 50 files of "tell the LLM what to do." It's 50 files of "prevent the LLM from doing what it naturally does wrong."

Every capability exists because we observed a failure mode and built a constraint. The framework is a catalog of LLM failure modes with mechanical fixes.

The LLM is the engine. The framework is the guardrails. Without guardrails, the engine runs off the road every time — not because it's bad, but because it's powerful and undirected.

---

## Notes for speaker

- **Total development time:** 3 weeks (Mar 28 - Apr 17), evolved alongside the product it serves
- **The product (SENDEX) is real** — 50K lines, 13 validated studies, used by scientists. The framework emerged from building it, not the other way around.
- **Every slide after #3 starts with "what happened"** — ground each capability in the specific incident that motivated it. Not "we thought it would be nice to have X" but "X broke and we built Y to prevent it."
- **The autopilot is not AGI.** It's a DAG executor with budget controls. The hard decisions are still human. The value is removing the 80% of workflow that's mechanical.
