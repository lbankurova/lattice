# Building an LLM Dev Harness — Patterns from Lattice

Audience: Datagrok team building out their own LLM-assisted development harness. This is a generalization of what Lattice does and *why* — the underlying LLM failure modes each piece exists to address. Borrow what fits.

---

## 1. What "the harness" actually is

A harness is everything around the model that makes it behave like a disciplined engineer instead of a fluent improviser. It is **not** a chat wrapper. It is the union of:

| Piece | What it does | Concrete form in Lattice |
|---|---|---|
| **Skills** (prompts) | Tell the model *how* to do one thing | `commands/lattice/*.md` (26 skills) |
| **Agents** (sub-models with isolated context) | Force a fresh viewpoint | `agents/*.md` (peer-review, architect-reviewer, decision-auditor, post-impl-reviewer) |
| **Workflows** (DAGs) | Tell the orchestrator *what runs when* | `workflows/*.yaml` (7 cycles) |
| **Hooks** (pre/post tool-use) | Mechanically block defective actions | Claude Code `.claude/settings.json` + git hooks |
| **State files** (checkpoints, locks, decision log) | Let the system survive `/clear`, crashes, parallel sessions | `.lattice/cycle-state/*.yaml`, `.lattice/decisions.log`, `.lattice/*.lock` |
| **Audits** (scripts) | Detect drift between code, spec, knowledge | `scripts/*.py`, `scripts/*.sh` |
| **Knowledge artifacts** | Give the model durable memory the prompt window can't hold | `docs/_internal/knowledge/*.md` |

The thesis is that **LLM behavior is a lossy decompression of training data conditioned on prompt + context**. Everything in the harness is a way to make that decompression land in the right place — and to fail loud rather than fail silently when it doesn't.

---

## 2. LLM limitations the harness exists to solve

### 2.1 Self-review is worthless

**Why:** the rationale for every decision is in the model's context window. It cannot see its own blind spots. "Review your work" produces "LGTM."

**Fix:** independent agents launched with `subagent_type` get a fresh context window. The reviewer sees the artifact and only the artifact — not the reasoning that produced it. Lattice has 4 such agents (peer-review, architect-reviewer, decision-auditor, post-impl-reviewer). Verdicts persist as `attestations[]` in a gate file the commit hook reads.

### 2.2 Context window rot

**Why:** as a session accumulates state (prior steps, outputs, peer-review back-and-forth), retrieval degrades and the model starts contradicting earlier decisions. Empirical: a NOAEL research→blueprint→build run accumulated ~712K tokens in a single session and started drifting; warn at 500K, halt at 750K (Opus 1M window).

**Fix:**
1. **Checkpoint and stop at phase boundaries.** Each cycle (research, blueprint, build) terminates with a deterministic state file. The next phase starts in a clean session that reads the state file. The default is *not* to auto-chain phases. Make phase transitions a first-class concept and force `/clear` between them.
2. **Per-call telemetry.** After every skill node runs, write a JSONL row with input/output tokens. Block the workflow on threshold breach with a typed reason (`CONTEXT_ROT`).

### 2.3 No memory across sessions

**Why:** every new session starts cold. Without external memory the model re-tries failed approaches, re-litigates settled decisions, re-discovers known constraints.

**Fix:** four kinds of durable memory, in order of authoritativeness:
1. **Decision log** — append-only TSV of every skill outcome (`.lattice/decisions.log`).
2. **Cycle state** — per-topic YAML capturing checkpoints, key decisions, costs, subsystems touched.
3. **Knowledge files** — typed YAML facts (`knowledge-graph.md`) for atomic, contradictable claims (numeric thresholds, regulatory cutoffs); markdown registries for indexes.
4. **Commit trailers** — `Topic:`, `Phase:`, `Coverage:` on every commit. The reconciler greps git log to derive truth when state files drift.

**Generalization:** the source of truth for "what happened" is git, not the state files. Build a reconciler from day one — state files will lie eventually.

### 2.4 Drift under cognitive load

**Why:** told 19 rules, the model honors maybe 10 reliably. The remaining 9 it forgets, especially under task pressure ("just fix the bug").

**Fix:** **mechanical enforcement, not honor system.** Every rule that has actually shipped a defect gets a hook:
- Pre-commit hook blocks commits without a fresh review-gate file.
- PreToolUse hook blocks Write/Edit when design-mode preamble is `pending`.
- PostToolUse hook blocks writes containing `Co-Authored-By:`.
- Commit-intent file pre-declares the staged set; pre-commit blocks unexpected files (catches concurrent-staging pollution from parallel sessions).

**Generalization:** for every rule, ask *"how do I find out it was violated?"* If the answer is "I'd notice in code review," that rule will be violated routinely. Move it to a hook or accept that it's aspirational.

### 2.5 Featuritis / scope creep

**Why:** the model defaults to "more capable = better." A spec for "show NOAEL confidence" turns into 8 panes, 12 toggles, 3 override surfaces.

**Fix:**
- **Spec value audit** — multi-feature specs must answer per-feature: frequency, current workaround, downstream impact. Categorical reasoning ("we infer N things, each needs UI") is rejected.
- **Architect gate** with verdicts `PASS / SIMPLIFY / REJECT / SCIENCE-FLAG`. SIMPLIFY at `Risk: None` auto-applies (dead code, unused exports). Non-trivial routes to user.
- **No unprompted deferrals rule.** "We'll do it later" is invalid unless there's a real dependency or explicit user defer.

**Generalization:** the model has no intrinsic taste for minimum viable scope. Make the audit mandatory and structured (frequency / workaround / impact per feature), and have the architect agent emit specifically-shaped verdicts the executor can route on.

### 2.6 Bikeshedding and runaway loops

**Why:** two reviewers disagree about phrasing → orchestrator escalates → user spends 20 minutes on whether "evaluate" or "assess" is the better verb. Or auto-resolve oscillates forever between two phase-routings.

**Fix:**
- **2-round peer review max** — Round 3 is escalation, never another round.
- **Bikeshed arbiter** — when R2 raises a new objection on a previously-SOUND finding, classify the objection: presentation-only or factually-unsupported → auto-side with R1; only verifiable factual disputes escalate.
- **Persistent-FLAWED arbiter** — when both rounds flag the same issue, mark each side's evidence VERIFIABLE/UNVERIFIABLE, drop unverifiable, only direct contradictions on verifiable items reach the user.
- **Loop cap** — outer autopilot loop is capped (default 50). Force-stop names the failure mode (`auto-resolve oscillating`).

**Generalization:** every infinite loop the model can construct, it will. Put hard caps on round counts and outer loops, and make the rubric for "is this objection substantive" explicit and machine-evaluable.

### 2.7 Fabrication / hallucinated citations

**Why:** asked for a literature reference, the model will produce a plausible-looking DOI that doesn't exist.

**Fix:**
- **Mandatory tool call before claim** — algorithmic peer-review must invoke `query-knowledge.py` against the project's typed fact graph and cite returned facts. No invocation = re-launch.
- **Verdict downgrade** — claims without a regulatory standard / DOI / PMID / internal validation card are downgraded to `OPINION` and don't count as findings.
- **No-fact-found stub** — when the typed graph has no matching fact, the script emits an explicit "no fact found, falling back to LLM judgment with caveat." That stub is acceptable in citations; "generally accepted" is not.

**Generalization:** require tool invocation as the proof of consultation. "I consulted the literature" is unverifiable; "I called `query-knowledge.py --scope species:rat` and the result was X" is.

### 2.8 Concurrent agents stepping on each other

**Why:** running two parallel sessions, both stage files, one commits — the other's work gets swept into the wrong commit.

**Fix:**
- **Outer-held commit lock** — autopilot acquires `.lattice/commit.lock` *before* `git add`, releases after commit.
- **Topic WIP lock** — per-topic, 30-min stale threshold, prevents two agents working the same topic.
- **Commit-intent file** — agent declares the file set before staging; pre-commit blocks if staged set differs.
- **Revision-checked state writes** — every cycle-state YAML has `revision: N`; re-read before write, abort on mismatch.

**Generalization:** if you ever run autopilot or background agents, every shared file is a concurrency hazard. Lock at the right granularity (per-topic for work, per-repo for commits) and use file-level revision checks for last-writer-wins safety.

### 2.9 "Plumbing-only rebuttals" to scientific concerns

**Why:** when a reviewer flags "this output is wrong," the model responds with "the toggle still flows through, the cache invalidates correctly" — answering the wrong question.

**Fix:** **science preservation gate (rule 14) + algorithm defensibility (rule 18)** — a SCIENCE-FLAG can only be cleared by (a) fix, (b) data-grounded counter-evidence in a specified format, or (c) explicit user defer with named dependency. Pipe / cache / type-correctness arguments are insufficient.

**Generalization:** for any domain where correctness is judged on output not implementation, the gate clearance criteria must demand output evidence. The model will route around any softer rule.

---

## 3. Why the cycles are what they are

Lattice has three primary cycles plus a meta-orchestrator. Their shape is not arbitrary — each phase corresponds to a cognitive mode the model is *bad at mixing*.

### 3.1 The three modes

| Cycle | Cognitive mode | Why separate |
|---|---|---|
| **Research** | Open-ended, divergent, "what does the literature say" | Model is permissive about evidence; needs adversarial review to ground |
| **Blueprint** | Convergent, "given these constraints what should we build" | Model is biased toward elaborate solutions; needs simplicity + reuse audit |
| **Build** | Mechanical, "implement to spec, don't drift" | Model is biased toward "improving" the spec mid-flight; needs a gate that says "did you actually build what was specified" |

Mixing them in one session is the fastest way to ship plausible-looking nonsense. The cycle boundaries enforce a context flush between modes.

### 3.2 Why three paths, not one

Single-cadence frameworks ("every topic goes through stages X→Y→Z") fail the moment a topic doesn't fit. Lattice's `cycle.yaml` *classifies* the work first:

- **Full cycle** (research → blueprint → build) — complex / new domain. Default.
- **Spike cycle** (spike → spec-from-code → review) — known territory. Build first, spec generated *after* the artifact is real.
- **Bug-fix cycle** (classify → investigate → fix → stress → review) — defects.

All three terminate at the same review gate. Classification is presented to the user, not auto-decided. **Generalization:** make dispatch the first step. The cost of routing a topic to the wrong cycle is high; the cost of asking "what kind of work is this" is one approval click.

### 3.3 Why peer review is two rounds, not one or three

- **One round** lets the model rubber-stamp itself if the reviewer mis-fires.
- **Three rounds** exponentially grows context for sub-linear quality gain (R3 is almost always bikeshed).
- **Two rounds** with a fresh agent in R2 (optionally `--novel` to force different sources) catches what R1 missed. New findings on previously-SOUND items are arbitrated mechanically; only verifiable factual disputes reach the user.

### 3.4 Why phases checkpoint-and-stop instead of auto-chaining

Each phase produces enough state in the cycle-state YAML (`key_decisions`, `constraints`, `output`, `next_needs`) that the next phase doesn't need the prior phase's *conversation*. Auto-chaining defeats the design — it carries context-window pollution forward.

The exception is `--continue` (autopilot). Humans usually shouldn't use it.

### 3.5 Why every cycle ends at a single review gate

One gate, one commit format, one set of attestations. The harness can verify "is this commit valid" by reading one file (`.lattice/review-gate.json`) instead of inspecting eight different artifacts. The gate is single-use — consumed by the post-commit hook — so stale gates can't ship code.

---

## 4. Skills vs Roles vs Agents vs Teams

The terminology gets muddled. Here is the disambiguation Lattice uses, in order of independence-from-orchestrator-context.

### 4.1 Skill

A **markdown prompt file**. Loaded into the *current* context. Used when:
- The work is part of a continuous flow.
- The orchestrator's existing context (prior steps, decisions) is *helpful* to the next step.
- You want the model to act with full project awareness.

Examples: `/lattice:implement`, `/lattice:synthesize`, `/lattice:probe`. These need to know what just happened.

**Cost:** prompt tokens loaded into your active context. Bigger skills = faster context rot.

### 4.2 Role

A **persona-flavored skill** — same mechanics as a skill, but framed as a domain expert. In Lattice these are `/lattice:backend-dev`, `/lattice:frontend-dev`, `/lattice:ux-designer`, `/lattice:dg-developer`. Used when:
- The work is domain-specific and benefits from a stylistic frame.
- You want the model to apply a known set of conventions (e.g., Datagrok JS API patterns).

The line between skill and role is blurry. Lattice doesn't enforce a hard distinction — roles are skills with a domain identity.

### 4.3 Agent (sub-agent)

A **separately-spawned model instance** with its own context window. Launched via the harness's `Agent` tool with a `subagent_type`. Used when:
- The work requires *independence from* the orchestrator's reasoning. Self-review is the canonical case.
- You want to limit which tools the sub-model can call (read-only review, no Edit/Write).
- You want to bound the cost of an exploratory search without polluting the main context.

Lattice's four registered agents:
- **peer-review** — blind scientific challenge, no project context.
- **architect-reviewer** — code/spec quality, overengineering, science preservation.
- **decision-auditor** — merit-driven rationale + unprompted deferral check.
- **post-impl-reviewer** — spec-vs-code evidence trace.

**Critical detail:** the harness loads the agent definition once per launch. The *orchestrator* should pass only a brief prompt + artifact path, never inline the agent's instructions. Inlining is what produced ~10K wasted tokens per launch in the prior pattern (retired 2026-04-27).

**Cost:** sub-agent runs in its own context, billed separately. Worth it for any review that must be honest.

### 4.4 Team (not a Lattice primitive — but worth naming)

A **set of agents launched in parallel**, each with a different lens, whose outputs are reconciled by the orchestrator. Lattice does this in two places:
- `/lattice:review` runs architect-reviewer, decision-auditor, post-impl-reviewer concurrently and aggregates verdicts.
- Peer review R2 with `--novel` is conceptually a "second opinion" team where R1 + R2 + arbiter form a 3-agent quorum.

Datagrok teams may want this pattern for domain-mixed work — e.g., a frontend agent + backend agent + data-model agent reviewing the same spec from their respective angles.

**When to use what:**

| Need | Use |
|---|---|
| Continuous work in current context | Skill |
| Domain-flavored continuous work | Role (= skill with persona) |
| Independent verdict | Agent |
| Multi-lens verdict | Team (parallel agents + reconciler) |

The Datagrok team's first decision should be: **for which steps is honest disagreement load-bearing?** Those steps need agents. Everything else is a skill.

---

## 5. Enforcement layers

There are five enforcement levels. Pick the lightest one that actually catches the failure.

| Level | Mechanism | When |
|---|---|---|
| **Prompt** | "Do X" in skill markdown | The model usually does X without reminding |
| **Structural gate** | Skill output must match a shape (≥3 findings, 6 sections, etc.) — orchestrator re-launches on failure | The model sometimes skips X under load |
| **Hook (PreToolUse / PostToolUse)** | Blocks the tool call mechanically | The model has shipped a defect from skipping X |
| **CI / pre-commit** | Blocks the commit | The hook can be bypassed and X has shipped to main |
| **Audit script** | Periodic scan + report | The defect is detectable but not blockable cheaply |

Lattice uses all five. Datagrok will likely need the same.

The escalation rule: **a rule violated three times moves up one level.**

---

## 6. The "instructions ≠ behavior" trap

This is the single most expensive lesson. **Every gate that's described in prose only is theatrical.**

Example: pcc CLAUDE.md rule 6 says "after implementing from a spec, archive it and extract knowledge." For three months this was prose-only. Specs accumulated in `incoming/` because the model would say "I'll archive in a follow-up" and never do it. The fix wasn't a sterner prompt — it was a pre-commit hook that blocks `feat:` commits when archive/extraction is missing.

**Generalization for Datagrok:** every load-bearing rule needs (a) a way to detect the violation in CI and (b) a way to block the violation pre-merge. If neither exists, the rule is a wish. Tracking which rules are enforced vs aspirational is itself a useful artifact.

---

## 7. What's domain-neutral vs scientific

Lattice's three layers separate concerns:

- **Layer 3 (Process)** — cycle structure, hooks, locks, attestations, decision log, peer-review protocol. **All transferable.**
- **Layer 1 (Platform)** — Datagrok design system, UX patterns (WIP). Adapt the *enforcement pattern* (design-mode preamble gate, casing conventions, color tables) without copying pcc's specific tables.
- **Layer 2 (Scientific)** — typed knowledge graph, algorithm defensibility, SCIENCE-FLAG, validation ratchet. The pattern (typed-fact graph + audit script + mandatory query-on-claim) is reusable for any high-stakes domain — pharma, finance, regulated. For general dev tooling it's overkill.

The minimum viable Datagrok harness is probably:
1. Skills + roles for your common work.
2. Agents for review (peer-review + architect equivalent).
3. Three cycles with checkpoint-and-stop boundaries.
4. Pre-commit hook for the review gate.
5. Decision log + commit-trailer reconciliation.

Add validation ratchet, knowledge graph, and the algorithmic-tightening protocol only if you have an analytical correctness surface that warrants them.

---


## Appendix: file map

| Topic | File |
|---|---|
| Pipeline overview | `WORKFLOW.md` |
| Executor + autopilot internals | `WORKFLOW-INTERNALS.md` |
| All hook / gate mechanisms | `ENFORCEMENT.md` |
| Hard rules with rationale | `CLAUDE.md` |
| Skill prompts | `commands/lattice/*.md`, `commands/ops/*.md` |
| Independent agents | `agents/*.md` |
| Workflow DAGs | `workflows/*.yaml` |
| Project scaffold | `scaffold/` |
