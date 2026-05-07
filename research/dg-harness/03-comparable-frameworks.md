# Comparable agentic dev frameworks

> Section B of the dg-harness deliverable. Question being tested: does Lattice's seven-piece harness pattern (skills / sub-agents / workflows / hooks / state / audits / knowledge) generalize, and is there a precedent for a "platform-agnostic harness" claim. This file documents what other systems do so the recommendation can rest on evidence.

---

## Already Known

Vocabulary used below comes from the prior corpus rows on Lattice:

- **Seven-piece taxonomy** (`README.md` "What 'the harness' contains", lines 27-40): skills (markdown prompts), sub-agents (separately-spawned model instances with fresh context), workflows (YAML DAGs), hooks (mechanical pre/post gates), durable state (decision log + cycle-state YAML + locks + telemetry), reconciler (`git log` Topic-trailer truth), audits, knowledge artifacts.
- **Nine LLM failure modes** (`README.md` "Failure modes and mechanisms", lines 126-234): self-review, context-window degradation, cross-session memory loss, rule-drift under task pressure, scope creep, runaway loops, fabrication, concurrency conflicts, wrong-question substitution.
- **Five-level enforcement ladder** (`harness-for-datagrok.md` §5): prompt → structural gate → hook → CI/pre-commit → audit. Lattice's escalation rule: a rule violated three times moves up one level.
- **Three-mode cycle structure** (`harness-for-datagrok.md` §3): research / blueprint / build, each terminating at a checkpoint state file rather than auto-chaining the conversation.
- **Two-round peer review with arbiter** (`harness-for-datagrok.md` §3.3): R1 then R2-with-fresh-context, with a bikeshed arbiter that classifies new R2 objections into PRESENTATION_ONLY / FACTUAL_DISPUTE / FACTUAL_UNSUPPORTED.
- **Verdict-enum registry** (`README.md` line 33): authoritative declared verdict set per gate-producing skill node, validated at workflow load time before any node runs.
- **Three transferability layers** (`README.md` "Three layers", lines 301-309): Process (most transferable) / Platform (Datagrok-specific) / Scientific (high-stakes domain only).

These are the categories used in every per-system table below, so deltas line up apples-to-apples.

---

## Methodology

**Public sources consulted (date: 2026-05-07):**
- GitHub repository READMEs and `docs/` trees of each open-source project.
- Each project's official documentation site (aider.chat, docs.cline.bot, docs.continue.dev, swe-agent.com, docs.openhands.dev).
- Architecture papers where they exist (SWE-agent at arXiv 2405.15793).
- Vendor documentation for the BI plugin platforms (tableau.github.io, community.spotfire.com, learn.microsoft.com, docs.streamlit.io).
- For Cursor: cursor.com/docs (closed source) + community forum threads + third-party tutorials. Marked `[INFERRED FROM PUBLIC SURFACE]` where the architectural detail is reverse-engineered from configuration knobs rather than direct documentation.

**What I did not do:**
- Read source code directly. Architecture claims about each system are at the documented-design level, not the call-graph level. This is the right granularity for the comparison; Lattice's documentation is also at this level.
- Run any of the systems. Benchmark numbers are vendor-reported; I have not reproduced them.

**Closed-source caveat:** for Cursor specifically, what we know is bounded by the configuration surface they expose to users (Rules, MCP servers, model picker, mode toggle). The internal orchestration (does a sub-agent run with fresh context? does the Background Agent share state with the foreground?) is not publicly documented. Treat closed-source claims as upper-bound: if it isn't visible in their config surface, we don't know it exists.

**Bias note:** Aider, OpenHands, and SWE-agent get the deepest treatment because they have the most architectural surface area to compare against and the most-cited benchmark numbers.

---

# Group 1 — General agentic dev frameworks

## Aider

| Field | Value |
|---|---|
| Source | github.com/Aider-AI/aider; aider.chat/docs |
| Open / closed | Open source (Apache 2.0) |
| Architecture style | Terminal CLI in a single Python process. Conversational REPL with slash commands. Single main loop; turn = user prompt → repo-map context build → LLM → diff parse → apply → auto-commit. |
| Skill granularity | None at the prompt level — user adds files to chat with `/add`, `/architect`, `/ask`, `/code`, `/run`. Behaviour is mode-flagged on the same loop, not skill-shaped. |
| Sub-agent model | **Yes — but only at the model-pair level.** "Architect mode" pairs a reasoning model (architect) with an editor model (editor). Architect produces solution prose; editor turns it into edit-format diffs. No fresh-context isolation; both see the same conversation. Vendor calls this a two-model pattern, not multi-agent. |
| Workflow shape | Linear conversational. No DAG. The architect→editor pair is a fixed two-step sub-loop within one user turn. |
| State persistence | `.aider.chat.history.md` (full transcript, in-repo), `.aider.input.history` (command line), `.aider.tags.cache.v3/` (repo-map cache). Conversation IS the state — no checkpointed phase boundaries. |
| Hook layer | **Git-native.** Auto-commits every successful edit with model-generated message. `--auto-commits` / `--dirty-commits` toggles. No pre-commit hook integration; relies on git's own hooks if present. |
| Knowledge layer | **Repo map** — tree-sitter-parsed list of class/function signatures across the repo, ranked by PageRank-style graph centrality on import edges, budgeted to ~1000 tokens by default. CONVENTIONS.md file loaded via `read:` directive in `.aider.conf.yml`. Both are passive context, not queryable from inside the loop. |
| Locks / concurrency | None. Single-session assumption. Two parallel `aider` processes on the same repo would race on git operations. |
| LLM-failure mitigations cited | Architect mode addresses the "split-attention" failure (model trying to reason and format simultaneously). Repo map addresses context-window saturation. CONVENTIONS.md addresses rule-drift (passively). Self-review, context rot across sessions, runaway loops, fabrication, concurrency — none addressed. |

**Benchmark surface:** Aider authors maintain two benchmarks. The **edit-format leaderboard** measures whether a model can produce a parseable diff that passes Exercism unit tests; this is a probe of edit reliability, not problem-solving. The **polyglot leaderboard** is 225 hard Exercism exercises across C++, Go, Java, JS, Python, Rust with two attempts and test-error feedback between attempts. As of late 2025 / early 2026, GPT-5 leads polyglot at 88.0%, Claude Opus 4.5 at 89.4% (vendor-reported), with Gemini 2.5 Pro at 82.2% and o3 at 81.3%. The architect-mode paper (Sept 2024) reports o1-preview + o1-mini and o1-preview + DeepSeek tied at 85.0% on Aider's internal edit benchmark, with Sonnet/Sonnet self-pairing outperforming the Sonnet solo baseline of 77.4%. Translation: separating reasoning from editing is worth ~5-7 percentage points on edit benchmarks.

**What's clever.** The repo map is the single most-cited contribution. Tree-sitter parses signatures from every file; a graph-centrality algorithm ranks them; the top ~1000 tokens worth become the project's "shape" loaded into every prompt. This addresses context-window degradation differently from Lattice's checkpoint-and-stop: Aider keeps the model in one session but compresses the project into a digest. Architect mode is the second clever move — it's the simplest possible expression of "different cognitive modes shouldn't share context within a single turn," and it gets measurable benchmark gains without any executor or DAG.

**What's missing relative to Lattice.** No fresh-context sub-agent (the editor sees the architect's prose, not just the artifact). No two-round review at all. No verdict registry, no DAG, no locks, no decision log, no commit-trailer reconciler. The conversation transcript is the only durable artifact; cross-session "memory" means the user pastes prior context back in. Concurrency hazards are unmitigated. No notion of phase boundaries — research, blueprint, and build all live in the same chat.

**What Lattice could borrow.** Repo map is the strongest borrow candidate. Lattice's knowledge layer is hand-curated typed YAML; Aider's is mechanically extracted from source. The two are complementary — a repo-map analogue would give the synthesize and design skills a "shape of the codebase" digest without requiring the developer to maintain it. Architect mode is also worth studying: the data is empirical (~5-7% on benchmarks) for a near-zero-cost split. Lattice does this at the cycle level (research vs blueprint vs build are different sessions); Aider does it within a single turn, and the within-turn variant might be valuable for build-cycle implementation steps where the implement skill currently both designs and edits.

---

## Cline

| Field | Value |
|---|---|
| Source | github.com/cline/cline; docs.cline.bot |
| Open / closed | Open source (Apache 2.0). VS Code extension. |
| Architecture style | VS Code extension with a webview panel. Single-agent autonomous loop with mandatory user approval on every tool call (file write, terminal exec). |
| Skill granularity | None at the framework level. Cline ships **Plan Mode** and **Act Mode** as system-prompt variants. User can author `.clinerules/*.md` files that append to system prompt; conditional rules use YAML frontmatter to gate by glob/state. |
| Sub-agent model | **No.** Single agent. Cline calls itself one autonomous entity in the README. |
| Workflow shape | Two-mode toggle (Plan / Act) sharing a single conversation. Plan reads + searches, cannot Edit/Write. Act inherits the plan conversation and executes. No DAG. |
| State persistence | **Checkpoints** — extension snapshots the workspace at each step, enabling restore via the diff view. No long-lived YAML state file analogous to Lattice's `cycle-state/{topic}.yaml`. |
| Hook layer | Auto-approval toggles (per-tool: file edits, terminal, browser). User-approval IS the hook — the loop pauses on every tool call by default. No git pre-commit integration ships in the extension. |
| Knowledge layer | `.clinerules/` directory of markdown files appended to the system prompt. Conditional activation via YAML frontmatter (glob match or context match). Toggleable on/off via UI. Cline can read/write its own rules ("self-improving"). |
| Locks / concurrency | Per-VSCode-instance. Two VS Code windows on the same repo would race; not addressed. |
| LLM-failure mitigations cited | Plan/Act split addresses the "premature implementation" failure mode. Workspace checkpoints address rollback after a mistake. Auto-approval toggles address rule-drift on destructive ops. Self-review, context rot, fabrication, concurrency, runaway loops — not addressed. |

**Benchmarks.** None published in the README. Cline is positioned as a daily-driver IDE agent, not a SWE-bench contender.

**What's clever.** Two ideas. First, **mandatory user approval per tool call as the default** — Cline treats the human as the review gate. This is the lightest possible enforcement layer and works because the developer is sitting at the IDE. Second, **`.clinerules` as version-controlled, AI-editable system prompt fragments**. The rules are markdown files in `.clinerules/`, committed to git, conditionally loaded via YAML frontmatter. The AI itself can edit them, so the prompt evolves with the project. This is structurally identical to Lattice's `.claude/rules/` directory of always-on rule files plus the design-decisions table — but Cline made it a first-class user-facing surface (toggleable, conditional) where Lattice's rule files are flat and always-on.

**What's missing relative to Lattice.** No fresh-context review. No verdict-enum registry. No locks for parallel sessions. No commit-trailer reconciler. No DAG-shaped workflow (Plan/Act is two states, not a DAG). No bug-retro enforcement. Plan/Act addresses one failure mode; the other eight Lattice names are not addressed.

**What Lattice could borrow.** **Conditional rule activation via YAML frontmatter.** Lattice's design-decisions.md is a single 31-row file always loaded; Cline's `.clinerules/` decomposes that into per-rule files with glob/context predicates. The decomposition trades file-count cleanliness for token efficiency — rules only load when they apply. For the Datagrok harness, the frontend-ui-gate.md and design-decisions.md tables are >2000 tokens of always-loaded content; conditional activation would let component-specific rules (e.g., chart conventions) load only when chart files are in scope.

---

## Continue (Continue.dev)

| Field | Value |
|---|---|
| Source | github.com/continuedev/continue; docs.continue.dev |
| Open / closed | Open source (Apache 2.0). VS Code + JetBrains plugins; also a CLI; also a hub (Continue Hub / Mission Control). |
| Architecture style | Pluggable IDE assistant. Multiple modes: Chat, Edit, Agent, Autocomplete. Recent (Feb 2025) pivot toward **CI-native agent checks** — `.continue/checks/*.md` files run on every PR as GitHub status checks. |
| Skill granularity | **Block-shaped.** "Blocks" are the unit of customization: rules, prompts, models, context providers, MCP servers. Blocks compose into Assistants (configurations). Hub-distributed. |
| Sub-agent model | **Per-check, not within-session.** Each PR check is its own agent invocation; multiple checks run in parallel as independent statuses. No fresh-context review *within* a chat session. |
| Workflow shape | Two-axis: foreground (chat/edit/agent in IDE) is conversational; CI-side is fan-out (each `.continue/checks/*.md` is one agent). No DAG. |
| State persistence | `config.yaml` per-workspace; `.continue/checks/` for CI checks. Conversation history not persisted across sessions by default. |
| Hook layer | **GitHub status checks.** Each check is a markdown file with a name, description, prompt; passes/fails as a CI status. This is hook-shaped — blocking at the merge gate, not at the IDE turn. |
| Knowledge layer | **Context Providers** (codebase, terminal, open files, MCP). Hub blocks for shared rules/prompts/context across an org. |
| Locks / concurrency | Not documented. CI checks are presumed independent. |
| LLM-failure mitigations cited | The CI-checks pivot is a direct response to "rule-drift under task pressure" + "self-review" — moving the verdict to a separate process at PR time, with a fresh model invocation per check. None of the other failure modes are explicitly addressed in their docs. |

**Benchmarks.** None published.

**What's clever.** The **CI-checks-as-agents** pivot. The team explicitly moved from "AI assistant in your IDE" to "AI checks on every PR as GitHub status checks" with the v1.0 release. This is the most aggressive bet on enforcement-via-CI in the open-source space — they made the agent itself the merge gate. Each check is a markdown file in the repo, version-controlled, runnable in any CI. This converges on Lattice's pre-commit hook + review-gate.json pattern, but located at the GitHub PR layer instead of the local pre-commit layer. The block-distribution model (Continue Hub) is a packaging story Lattice does not have — Lattice is one repo's `.lattice/` directory; Continue made the rules/prompts/context portable.

**What's missing relative to Lattice.** Within a chat session, there's no fresh-context peer review. No verdict-enum registry. No DAG executor (CI checks are flat fan-out). No phase boundaries with checkpoint state files. No locks. No bug-retro pattern. The CI-checks pivot trades depth-of-orchestration for breadth-of-distribution.

**What Lattice could borrow.** **Block-shaped distribution** — Lattice's skills/agents/rules currently live inside a project. Continue's hub makes them shareable artifacts. For the Datagrok harness story specifically, distributable blocks (a "Datagrok JS API context provider," a "viewer-property-types verdict enum") would let the framework ship as composable units rather than a monorepo-shaped install. Continue's CI-check format also makes a pragmatic point Lattice should consider: the merge gate (PR) and the commit gate (pre-commit hook) are different enforcement layers; today Lattice owns the commit gate, but a PR-level check would catch defects that bypass the local hook (`git commit --no-verify`, or a different developer's machine without hooks).

---

## SWE-agent

| Field | Value |
|---|---|
| Source | github.com/SWE-agent/SWE-agent; arXiv 2405.15793; swe-agent.com |
| Open / closed | Open source (MIT). Research-grade, Princeton NLP. |
| Architecture style | Headless agent designed for benchmark runs and autonomous issue-fixing. Single LLM, single context window, command-line interface. Agent runs inside a Docker container ("environment"). |
| Skill granularity | **Tool bundles** in YAML. The agent's action space is a set of "tools" — custom shell commands installed in the container (file editor with line-numbered display, search, navigation, submit). Bundles are composable; the canonical SWE-bench setup uses ~9-10 tools. |
| Sub-agent model | **No, in core.** Single agent loop. EnIGMA mode (cybersecurity CTF variant) ships some delegation but architectural details are not public. The successor **mini-swe-agent** (July 2025) is explicitly minimalist: 100 lines of Python, no sub-agents, hits 65% on SWE-bench verified. |
| Workflow shape | Linear: prompt → action parser → SWE-ReX executes in container → observation → next prompt. `forward()` method on the Agent class is the single step. |
| State persistence | **Trajectory** — every (action, observation) pair logged to a `.traj` file. HistoryProcessor compresses prior turns to manage context budget. Trajectory is the durable artifact. |
| Hook layer | None. The agent's only "block" is structural: the action parser refuses to dispatch malformed actions. SWE-ReX (the deployment package) provides the Docker boundary. |
| Knowledge layer | None. The agent reads the repo via shell tools at run time; no pre-loaded repo map or knowledge graph. The paper's thesis is that **the interface design (the ACI) is what matters**, not external knowledge. |
| Locks / concurrency | Container-isolated. Each SWE-bench task runs in its own container; concurrency is a benchmark-runner concern, not an agent concern. |
| LLM-failure mitigations cited | Paper's central claim: **the ACI design impacts agent behavior more than the model.** Specific design choices: line-numbered file editor (not raw `cat` / `sed`), search restricted to grep-shaped output, action validation before dispatch. Addresses fabrication (file edits cite specific lines) and rule-drift (the action parser refuses ill-formed commands). Self-review, peer review, runaway loops, concurrency — not addressed. |

**Benchmarks (the load-bearing data).**
- Original SWE-agent (May 2024 paper, GPT-4): **12.5% pass@1 on SWE-bench**, vs 87.7% on HumanEvalFix. The SWE-bench number was state-of-the-art for non-interactive baselines at the time.
- SWE-agent 1.0 + Claude 3.7 (Feb 2025): SOTA on SWE-bench Full among open-source agents.
- **mini-swe-agent (July 2025): 65% on SWE-bench verified in 100 lines of Python.** This is the most architecturally important data point in this whole survey — it says that for a calibrated benchmark, the absolute minimum agent shell + a strong model gets within striking distance of multi-thousand-line agent frameworks.

**What's clever.** The **Agent-Computer Interface thesis**. The paper argues, with ablations, that agents fail because their tools are wrong, not because the LLM is dumb. Concrete example: standard Linux `cat` shows file contents without line numbers; the LLM then loses track of where it is editing. SWE-agent's editor tool prepends line numbers to every read, so the model can address ranges precisely. This is a different bet than Lattice — it spends complexity on the *interface to the world*, not on *orchestration around the model*. The mini-swe-agent follow-up is a self-disciplining move: if 100 lines of Python plus a strong model hits 65% on SWE-bench-verified, what value are the other layers adding? This is the right empirical question for any harness, including Lattice.

**What's missing relative to Lattice.** No multi-phase cycle. No peer review. No human-in-loop. No concurrency story (the benchmark harness handles task isolation). No knowledge layer beyond what the agent reads in-loop. No process-pollution or context-rot mitigation beyond HistoryProcessor's compression. Importantly: SWE-agent is a *benchmark agent*, not a *daily-driver dev harness* — its failure modes are different, and so are its mitigations.

**What Lattice could borrow.** **The ACI thesis applied to Datagrok plugin development.** Lattice's `query-knowledge.py` is already an ACI-shaped tool (a shell command with structured output the model invokes for typed-fact lookups). The bet should be expanded: every consultation with a typed registry, every peer-review cite, every commit-intent check should be a *tool the model invokes*, not prose the model is asked to produce. SWE-agent's discipline of "if it isn't a tool call, the model didn't do it" is the hardest version of Lattice's existing rule that fabrication is mitigated by requiring the tool invocation as proof of consultation. **The line-numbered editor** is also worth borrowing for any code-edit operation against algorithmic paths — Lattice currently relies on the model's general code-reading discipline; a line-numbered-context tool would harden algorithm-defensibility reviews against the "I edited line 47 but the file's line 47 isn't what I thought" failure.

---

## OpenHands (formerly OpenDevin)

| Field | Value |
|---|---|
| Source | github.com/All-Hands-AI/OpenHands; docs.openhands.dev; ICLR 2025 paper (OpenReview) |
| Open / closed | Open source (MIT, except `enterprise/`). All-Hands AI Cloud is the hosted variant. |
| Architecture style | **Event-stream architecture.** All agent ↔ environment interactions flow as typed events (Action, Observation) through an EventStream hub. AgentController drives the loop. Stateless Agent emits Actions; Workspace (Docker container or local process) executes them and returns Observations. |
| Skill granularity | **Multi-level.** "Microagents" are markdown files in `.openhands/microagents/` (repo) or `~/.openhands/microagents/` (user) or `skills/` (global). Loaded by trigger keywords or always-on (no-frontmatter). Microagents can declare their own MCP tools. The V1 SDK adds composable agents at the Python-API level. |
| Sub-agent model | **Yes — agent delegation.** A CodeActAgent can delegate to a BrowsingAgent (or other registered agent type). Each delegated agent has its own controller and event scope but writes back to the parent's EventStream. |
| Workflow shape | Event-driven loop: User Message → Agent → LLM → Action → Runtime → Observation → Agent. Linear within one agent; hierarchical across delegated agents. Not a DAG in the workflow-YAML sense. |
| State persistence | **EventLog** — append-only, append-only Conversation has an EventLog that serializes the full action/observation history. Event Storage and Replay is a documented feature. |
| Hook layer | Runtime sandbox (Docker, browser, or local) is the boundary. No git pre-commit integration shipped. SDK exposes lifecycle hooks at the Python level. |
| Knowledge layer | **Three-tier microagent loading**: global (`skills/`), user (`~/.openhands/microagents/`), workspace (`.openhands/microagents/`). Triggered by keywords or always-on. Each microagent can attach MCP tools. `.openhands/microagents/repo.md` is the canonical "what is this repo" artifact. |
| Locks / concurrency | Container-isolated per Conversation. Multiple Conversations in parallel are independent. Not documented for shared-repo concurrency. |
| LLM-failure mitigations cited | Stateless Agent + append-only EventLog addresses *replayability* (you can re-run the same action sequence). Microagent triggering addresses rule-drift (rules load when the keyword fires, not at every turn). Sub-agent delegation addresses scope (browsing-specific work routed to a browsing-specialized prompt). Self-review, peer review, fabrication, runaway loops, cross-session memory — not directly addressed at the framework level. |

**Benchmarks.**
- **77.6% on SWE-bench (badge on README, 2025).**
- Nov 2025: claimed SOTA on SWE-Bench Verified using inference-time scaling + a trained critic model (try multiple solutions, pick best). They explicitly note this works "without modifying the underlying agent model and scaffold."
- SWE-Gym fine-tuned 32B agent: 32%/26% on SWE-bench Verified/Lite, claimed SOTA for open-weights.
- Top performer on LiveSWEBench (contamination-free).

**What's clever.** Three things. First, the **event-stream + append-only EventLog architecture** is the most rigorous "git for agent runs" design in the open source space — every Action and Observation is a typed event, the log is replayable, and the Agent itself is stateless (state lives in the log). This is the same architectural insight as Lattice's "truth lives in `git log`, state files are derived" but pushed to the within-cycle level: the EventLog is to the Agent what `git log` is to Lattice's reconciler. Second, **microagents as a three-tier knowledge layer** (global / user / workspace, with keyword-triggered or always-on loading) is the most thought-out version of the conditional-rule-activation pattern Cline ships. The trigger-keyword model means a "Datagrok JS API" microagent only loads when the model is talking about that subject — directly addressing context-window degradation for large rule sets. Third, **inference-time scaling with a critic model** (Nov 2025 SOTA): they train a separate model to score candidate solutions and pick the best of N. This is a fresh-context reviewer in the strictest sense — the critic never sees the generation context, only the artifact. It is structurally identical to Lattice's peer-review sub-agent pattern, but applied at the per-action level rather than the per-cycle level, and with a *trained* judge rather than a *prompted* one.

**What's missing relative to Lattice.** No phase-boundary cycle structure (research / blueprint / build are not first-class). No verdict-enum registry validated at workflow-load. No DAG-shaped orchestration (event flow is linear within a Conversation). No commit-trailer reconciler (the EventLog is the within-conversation analogue, but doesn't bridge sessions). No bug-retro enforcement, no scope-creep arbiter pattern. The microagent system addresses rule-drift but not the harder failure modes (self-review with contaminated context, runaway oscillation, plumbing-only rebuttals).

**What Lattice could borrow.** **Append-only EventLog within each cycle.** Lattice's `.lattice/decisions.log` is one append-only TSV across all cycles; OpenHands' EventLog is one per Conversation. A per-cycle event log (every skill invocation, every gate check, every state-file write) would close the gap where today's reconciler can derive *what topic is in what phase* from `git log` but cannot derive *what happened during the cycle that produced this commit*. Replayability is also valuable for debugging: re-running a cycle from a checkpoint requires knowing the events that produced the state file, not just the state file. **Microagent trigger-keyword loading** is the second borrow candidate, applied to Lattice's domain-knowledge-map.md routing logic. Today the routing is a table the model is asked to read; making each row a triggered microagent with explicit keyword/glob predicates would make the routing mechanical instead of prompt-dependent. **Trained critic model** is a longer-horizon idea — Lattice's review sub-agents are LLM-prompted; a domain-specific scorer trained on past review outcomes (which are all in the git log) is a natural extension once the corpus is large enough.

---

## Smol-developer

| Field | Value |
|---|---|
| Source | github.com/smol-ai/developer |
| Open / closed | Open source. Often described by author as a "demo / library prototype." |
| Architecture style | <200-line Python CLI. Three-stage pipeline: `plan()` → `specify_file_paths()` → `generate_code_sync()` per file. |
| Skill granularity | Three named functions; not extensible at runtime. |
| Sub-agent model | None in core; `debugger.py` companion reads whole codebase to suggest specific fixes. |
| Workflow shape | Strictly linear. Three stages, no branches, no loops. |
| State persistence | Markdown prompt files (`prompt.md`) and intermediate `shared_dependencies.md`. Conversation is not retained. |
| Hook layer | None. |
| Knowledge layer | None. The prompt itself is the knowledge. |
| Locks / concurrency | Single-shot per invocation. |
| LLM-failure mitigations cited | "Engineering with prompts, not prompt engineering" — the explicit thesis is that the prompt file is the durable artifact, not the chat. Addresses cross-session memory loss in the cheapest possible way (the prompt persists). Nothing else is addressed. |

**Benchmarks.** None.

**What's clever.** Smol-developer is the negative-space example. Its design thesis — explicitly stated — is "AI is only used as long as it is adding value, then take over the codebase from your smol junior developer with no fuss." The three-stage pipeline is the absolute minimum viable agent: plan, list files, generate. The author is making a point that for greenfield codebase generation, you don't need a harness; you need a tight three-step prompt loop and a human who reviews. This is the right baseline to measure Lattice against: every harness piece needs to justify itself relative to "200 lines of Python plus a markdown prompt." Lattice's complexity is justified by failure modes that emerge in *multi-week multi-session work on a single project*, which is a different regime from smol-developer's "scaffold a new app from a paragraph."

**What Lattice could borrow.** Conceptually: the discipline of asking "if I removed this layer, what failure mode would re-emerge?" Smol-developer's existence is a reminder that for new-greenfield-app cases, no harness at all may be the correct answer. Empirically: probably nothing. The architectures don't share much surface.

---

## Cursor

| Field | Value |
|---|---|
| Source | cursor.com/docs (closed); community forum; third-party tutorials |
| Open / closed | **Closed source.** VS Code-based fork. The orchestration internals (turn handling, sub-agent dispatch, context budgeting, retrieval) are not publicly documented. |
| Architecture style | [INFERRED FROM PUBLIC SURFACE] Multi-mode IDE assistant. Modes: Ask (read-only chat), Edit (single-file diff), Agent (autonomous multi-file). Background agents (since v1.0, mid-2025) run in the cloud, take a ticket, work for tens of minutes, propose a PR. |
| Skill granularity | **Project Rules** in `.cursor/rules/*.mdc` (replacing legacy `.cursorrules`). Modular markdown files with YAML frontmatter declaring `alwaysApply`, glob match, or "agent-requested" activation. |
| Sub-agent model | [INFERRED FROM PUBLIC SURFACE] Background Agents are presumably distinct sessions with their own context, but the relationship to the foreground IDE session is not documented. No fresh-context review pattern is documented. |
| Workflow shape | Mode-toggle on a single chat surface. No DAG. Background agents are independent workflows triggered out-of-band. |
| State persistence | Chat history per project (proprietary). Project Rules are version-controlled. |
| Hook layer | [INFERRED FROM PUBLIC SURFACE] Auto-approval toggles per-tool. No documented git pre-commit integration. |
| Knowledge layer | Project Rules + MCP servers (any MCP-compatible tool). **Documented limit: ~40 active tools across all MCP servers; past that, tool definitions blow the context budget and the agent silently loses access to later tools.** This is the most concrete public architectural constraint Cursor admits to. |
| Locks / concurrency | Not documented. |
| LLM-failure mitigations cited | Mode-toggle (Ask/Edit/Agent) addresses scope-of-action by limiting tool surface per mode. Project Rules with conditional activation address rule-drift partially. The 40-tool ceiling is admitted as a context-pollution failure mode, with no documented mitigation beyond "use fewer MCP servers." |

**Benchmarks.** None published. Vendor-positioning claims about "best for coding" are not benchmarks.

**What's clever.** [INFERRED] Project Rules with `.mdc` frontmatter and `alwaysApply` / glob / agent-requested activation modes is the most polished version of conditional rule activation in the commercial space. Background Agents are the most aggressive "let it run for tens of minutes and review the PR" bet a major IDE vendor has shipped — converging on Continue's CI-checks pivot but with a long-running cloud worker rather than a per-PR one-shot.

**What's missing relative to Lattice.** Closed source means we don't know what's missing — we know what isn't documented. There is no public verdict-enum registry, no public DAG executor, no public locks, no public commit-trailer reconciler, no public peer-review pattern. The 40-tool MCP ceiling is the concrete admission that context-pollution is unmitigated past a threshold.

**What Lattice could borrow.** The **`.mdc` rule-activation surface** is the most shippable design from Cursor — combining Cline's per-file conditional rules with a polished frontmatter syntax (`alwaysApply: true`, `globs: ["**/*.tsx"]`, `description: ...`). Lattice could adopt this format directly for its rule files. The **40-MCP-tool ceiling** is a useful empirical constraint to internalize: past a certain tool count, tool definitions themselves cause context rot. Lattice's current tool surface is small; if a Datagrok harness adds many MCP servers (Datagrok JS API, doc search, validation runners), the ceiling will become load-bearing.

---

# Group 2 — Plugin platform peers

## Tableau Extensions API

**Plugin model.** Sandboxed iframe. An extension is an XML manifest (`.trex`) + an HTML page + JS that uses the Tableau-provided JavaScript library. Sandboxed extensions run in Tableau's hosting cloud service with stricter sandbox policies; "Network-Enabled" extensions self-host with broader permissions. Two extension types: dashboard extensions (placed like any dashboard object) and viz extensions (new mark types, GA in 2025.1).

**Build / publish flow.** Node.js + npm. SDK provides TypeScript samples and a local dev environment that replicates the hosting service for testing. Publishing goes through Tableau Exchange (their marketplace) with a review process for sandboxed extensions, or direct hosting for enterprise.

**Agentic-dev story today.** None native. Search results turn up third-party tooling (MigVisor 2.0's "Tableau-to-PowerBI migration agent," WinWire's agentic migration accelerator, Apps for Tableau premium extensions) but none are Tableau-the-vendor's. The closest first-party AI surface is Tableau's "Agentforce" / "Tableau AI" branding, which is end-user-facing analytics agents (ask-your-data) — *not* an authoring-side harness for extension developers.

**Ecosystem properties for a Lattice-shape harness.** Mixed. Pros: open SDK, public TypeScript types, clean iframe sandbox boundary maps to a Lattice "platform layer" in the same way Datagrok's JS API does. The `.trex` manifest is a contract triangle (declaration in XML, enforcement by Tableau's loader, consumption by the host) waiting to be made explicit. Cons: extensions are typically single-page JS apps with narrow surface area — the multi-week-multi-session regime that motivates Lattice's complexity may not apply for most extensions, which a smol-developer-shaped scaffolder could handle. The marketplace review gate is a CI-shaped enforcement layer that already exists; a Lattice-shape harness would need to slot in *before* the marketplace gate, at the dev-loop level.

---

## Spotfire Mods

**Plugin model.** Two types: Visualization Mods (custom viz that behaves like a built-in) and Action Mods (script bundles for analytical automation). Mods are signed by the author; trust is per-signer (company or end-user decides). API is backwards-compatible but not forwards-compatible — pick the lowest targeted Spotfire version.

**Build / publish flow.** Spotfire Mods SDK is an npm CLI (`@spotfire/mods-sdk`) for create/build/develop. Web tech stack (Node.js + JS/TS). Code signing required. Distribution via a Spotfire library / package.

**Agentic-dev story today.** None public. The Mods framework is positioned as a developer-empowerment story for the Spotfire ecosystem; AI-assisted mod authoring is not part of vendor messaging as of mid-2025 search results.

**Ecosystem properties for a Lattice-shape harness.** Reasonable fit. Pros: mod API is documented at the call-graph level; signing infrastructure is a contract triangle (declaration in source, enforcement at signing, consumption at trust verification); two mod types (viz vs action) map cleanly to Lattice's "frontend" vs "backend" role split. Cons: smaller community than Power BI / Tableau means fewer existing knowledge artifacts to lift into a typed-fact graph; the "trust the signer" model means a harness would need to interact with signing, which complicates auto-commit.

---

## Power BI Custom Visuals (pbiviz)

**Plugin model.** Custom visuals run inside an iframe sandbox in the Power BI rendering engine. Communication via `IVisual` interface (data + format options in; HTML/SVG/Canvas out). TypeScript compiled to JavaScript. **Hard sandbox constraints: no internet access, no persistent storage beyond session, sandboxed performance limits, limited platform-feature access.**

**Build / publish flow.** `pbiviz` CLI (Node.js, npm). Generates template project (correct folder structure, TS config, package refs). Outputs `.pbiviz` (zipped package). Distribution: organizational visual store (admin portal upload, centralized management) or AppSource certification (2-4 week Microsoft review).

**Agentic-dev story today.** Closest first-party: Phil Seamark's blog post "Create Custom Visuals in Power BI with GitHub Copilot" (Sept 2025) — but this is just Copilot inside VS Code, not a Power-BI-specific harness. Microsoft's AI surface is Copilot in Power BI (end-user-facing, ask-your-data), not authoring-side. No vendor-shipped agentic dev harness.

**Ecosystem properties for a Lattice-shape harness.** Strong fit on paper. Pros: largest community of the three BI peers (Power BI ships 30+ built-in visuals + 350+ custom visuals in marketplace); pbiviz CLI is a mechanical-hook substrate (could wrap pre-commit checks); IVisual TypeScript interface is a contract triangle waiting to be made explicit; sandbox constraints are unambiguous (no internet, no persistent storage) and would be load-bearing rules in a typed knowledge graph. Cons: AppSource certification is a weeks-long external review gate, so the Lattice review-gate pattern would need to layer underneath the certification gate without conflicting with it. The closed-corp ownership of the platform (Microsoft) means any harness is an outside-in build; no chance of merging into the platform itself.

---

## Streamlit Components

**Plugin model.** Two types: static (rendered once, controlled by Python) and bidirectional (Python ↔ JS message passing). Components run in a React frontend talking to the Streamlit Python server via WebSocket + Protocol Buffers. Distribution as Python packages (PyPI) wrapping JS bundles.

**Build / publish flow.** Clone `streamlit/component-template` (React or plain TypeScript flavor). Develop locally. Publish via standard PyPI flow. No marketplace gate, no review process — it's a pip-installable Python package.

**Agentic-dev story today.** None first-party. Streamlit-the-product is itself a "rapid AI app authoring" surface, but for the *components system itself* (the plugin extension surface), no agentic dev harness exists.

**Ecosystem properties for a Lattice-shape harness.** Weakest fit of the four. Streamlit Components are typically very small (a wrapper around an existing JS widget library) — the multi-week-multi-session regime that motivates Lattice's complexity barely applies. The lack of a marketplace gate also means there's no natural CI-layer enforcement to slot into. A smol-developer-shaped scaffolder is probably the right tier of tooling for Streamlit Components, not a Lattice-shape harness.

---

# Cross-cutting observations

## Where the open frameworks converge

Five strong convergences across Aider, Cline, Continue, SWE-agent, OpenHands, and (inferred) Cursor:

1. **Single-session, conversation-shaped main loop.** Every system above runs as one agent in one context window with one turn-based loop. The variations are about what the turn contains (Aider: prompt → repo-map → LLM → diff parse; Cline: prompt → tool-call-with-approval → repeat; SWE-agent: prompt → action-parser → container exec). None of them have a phase-boundary discipline that flushes context between cognitive modes. Lattice's research / blueprint / build cycle structure is the strongest divergence from this norm.

2. **Markdown-as-system-prompt-fragment.** `.clinerules/`, `.cursor/rules/*.mdc`, `.openhands/microagents/`, Continue's `.continue/checks/*.md`, Aider's `CONVENTIONS.md`, Cursor's Project Rules — all of them landed on "markdown files in a hidden directory, optionally with YAML frontmatter, glob/keyword-conditional, version-controlled." Lattice's `.claude/rules/` directory + design-decisions.md is in the same family. **This is the single most-converged design choice in the entire field.** The deltas are about activation rules (always-on vs glob vs trigger-keyword vs agent-requested) and AI-editability (Cline allows the agent to edit its own rules; Lattice does not).

3. **Some form of mode separation, but only at the within-session level.** Aider's architect-vs-editor, Cline's Plan-vs-Act, Cursor's Ask-vs-Edit-vs-Agent — they all do the within-turn or within-session split for "should the model be reasoning or acting." None of them do the *cross-session* split that Lattice does (cycle-state YAML as the inter-session handoff). The strongest empirical evidence that mode separation matters is Aider's architect mode benchmark (~5-7 percentage points on edit benchmarks), which generalizes to "any time you can avoid asking one model to reason and format simultaneously, you should."

4. **Git-as-truth, but stopped short.** Aider auto-commits every edit; Cline takes workspace checkpoints; OpenHands has an append-only EventLog; Continue runs CI checks on every PR. They all use git-shaped audit trails. *None of them* have a commit-trailer reconciler that derives state truth from the trailers — Lattice is alone in extending git-as-truth past "what was changed" into "what topic is in what phase." The OpenHands EventLog is closest in spirit but operates at within-Conversation scope, not cross-session topic state.

5. **Benchmarks are SWE-bench-shaped or absent.** Aider has its own Polyglot benchmark (88-89% on hard exercises by top models). SWE-agent and OpenHands compete on SWE-bench Verified (OpenHands at 77.6%; SWE-agent's mini variant at 65% in 100 lines of Python). Cline and Continue publish no benchmarks. Cursor publishes no benchmarks. Lattice publishes no benchmarks of the harness itself, only of the application built with it (the validation ratchet on PointCross / Nimble / TOXSCI studies). **There is no published benchmark of "harness quality" — i.e., does the harness reduce defect rate, recurrence rate, or scope creep over multi-week development.** This is a real gap in the field.

## Where they diverge from Lattice

Six divergences. These are where Lattice's opinionated choices don't show up in any other public system:

1. **Verdict-enum registry validated at workflow load.** No other system has structural validation of workflow files before any node runs. Continue's `.continue/checks/` are validated at PR time by the runner (markdown loads or it doesn't). OpenHands' EventLog is typed but at the event level, not the gate level. SWE-agent's tool bundles are validated against the action parser at config load. None of them enforce that a gate condition referencing a verdict literal must match a producer's declared enum — typo enforcement before runtime. This is a small-surface but high-leverage pattern that the field has not adopted.

2. **Two-round peer review with arbiter.** Continue does per-PR independent checks (no rounds). OpenHands' Nov 2025 inference-time-scaling-with-critic is the closest analogue (try N solutions, pick best with a critic) but it's a per-action quorum, not a two-round adversarial review. None of the open-source frameworks do the bikeshed-arbiter pattern (classify R2-only objections as PRESENTATION_ONLY / FACTUAL_DISPUTE / FACTUAL_UNSUPPORTED before escalating to user). This is one of Lattice's strongest novelty claims.

3. **Algorithm-defensibility gate (the LATTICE_ALGORITHM_CHECK env + 40-char rationale + staged-file regex).** No other system has a domain-shaped gate that demands data-grounded counter-evidence in a specified format to clear a SCIENCE-FLAG. The closest analogue is OpenHands' critic model, but the critic is trained, not a structural gate; it scores artifacts, doesn't demand a specific rationale shape. SWE-agent's action parser is a structural gate but operates at command syntax, not semantic content.

4. **Cross-session memory beyond conversation transcript.** Aider's chat history file is conversational. Cline's checkpoints are workspace snapshots. OpenHands' EventLog is per-Conversation. Cursor's project memory is opaque. *Only Lattice has the four-layer authoritativeness ladder*: commit trailers (truth) → decision log → cycle-state YAML → typed-fact graph. The reconciler that derives state from `git log` is Lattice-specific.

5. **Concurrency-aware locking.** Every other system implicitly assumes single-session use. Lattice's per-topic WIP locks + per-repo commit locks + revision-checked state writes + staging-drift detection at hook exit are sized for a developer running multiple parallel sessions (or autopilot + manual sessions interleaving). *No public framework I found has documented concurrency hygiene at this level.*

6. **Bug retrospective enforcement at the commit gate.** No other system blocks `fix:` commits without a 5-question retrospective. The closest analogue is human-process tooling (incident reviews, postmortem templates) outside the agent loop entirely. Lattice's bug-retro hook is the only place in the surveyed field where the agent is forced to write a structured retro before its bug-fix can land.

## Where the BI plugin peers converge

Three convergences:

1. **Zero first-party agentic dev story for plugin authors.** Tableau, Spotfire, Power BI, and Streamlit Components — none of them ship a vendor-blessed agentic dev harness for *plugin authors*. They ship end-user-facing AI (ask-your-data, Copilot in Power BI, Tableau AI, Streamlit's app-authoring slant). The plugin authoring SDKs are designed for human authors with web-tech skills.

2. **iframe sandbox + manifest + JS bundle is the universal plugin shape.** Tableau's `.trex`, Spotfire's mod manifest, Power BI's `.pbiviz`, Streamlit's WebSocket-bridged React component — they all converge on the same architecture. The IVisual / VizExtension / Mod API surfaces differ in detail but not in shape. This is good news for any harness that targets BI plugin authoring: the platform-side rules (sandbox boundaries, contract triangles, package metadata) are mostly transferable in form across vendors.

3. **Marketplace review as the de-facto enforcement layer.** Tableau Exchange, Spotfire's signer-trust, Power BI's AppSource (2-4 week Microsoft review) — all of them have an external review gate after the developer ships. None of them have a *pre-commit* gate the developer can layer in locally. This is the gap a Lattice-shape harness fills: catching defects before the marketplace gate, not as a substitute for it.

## What this implies for the "platform-agnostic harness" claim

**Honest answer: no system in the surveyed field implements the full Lattice pattern, but several systems implement *individual pieces* of it well.** A defensible "platform-agnostic harness" claim has to account for both.

The seven-piece taxonomy maps onto the field as follows:

| Lattice piece | Closest precedent in the field | How close |
|---|---|---|
| Skills (markdown prompts) | OpenHands microagents, Cline `.clinerules`, Cursor `.cursor/rules/*.mdc`, Continue blocks | **Very close.** Markdown-as-system-prompt-fragment is the most converged design in the field. |
| Sub-agents (fresh context) | OpenHands inference-time-scaling-with-critic; Aider architect mode | **Partial.** OpenHands' critic is the structurally closest, but it's a trained scorer at the per-action level, not a prompted reviewer at the per-cycle level. Aider's architect+editor share context within a turn. |
| Workflows (DAG YAML) | SWE-agent's tool bundles (config YAML, but linear); Continue's `.continue/checks/*.md` (flat fan-out) | **Far.** No public system has a multi-node DAG executor with topological dispatch and gate routing. |
| Verdict-enum registry | None | **No precedent.** This is a Lattice-specific pattern. |
| Hooks (mechanical gates) | Continue CI checks at PR; Aider auto-commit; pre-commit hooks generally | **Partial.** Field uses git hooks; Lattice's review-gate.json + 5-step pre-commit + Claude Code hooks combo is denser than anything else surveyed. |
| Durable state (decision log + cycle-state + locks) | OpenHands EventLog (per-conversation); Aider chat history | **Partial.** EventLog is the strongest analogue but scoped to one conversation. No public system has the four-layer authoritativeness ladder. |
| Reconciler (git log derives truth) | None | **No precedent.** This is a Lattice-specific pattern. |
| Audits (drift detection scripts) | Continue CI checks (drift-shaped); SWE-agent's action validators | **Far.** No public system has periodic typed-knowledge-graph audits or contract-triangle straggler scans. |

**Where Lattice has no precedent:**
- Verdict-enum registry validated at workflow load
- Commit-trailer reconciler that derives topic state from `git log`
- Two-round peer review with bikeshed + persistent-FLAWED arbiters
- Algorithm-defensibility gate with rationale-shape validation
- Per-topic WIP locks + per-repo commit locks + staging-drift detection (full concurrency hygiene)
- Bug-retro enforcement at the commit gate

**Where Lattice has strong precedent (and could borrow):**
- Markdown-rule activation surface (Cline, Cursor, OpenHands microagents) — Lattice should adopt YAML-frontmatter conditional activation
- Repo map (Aider) — Lattice does not have a mechanically-extracted code shape digest
- Append-only EventLog (OpenHands) — within-cycle event log would close a debuggability gap
- Architect-mode within-turn split (Aider) — Lattice has cycle-level mode separation but not within-turn
- Block-distribution (Continue Hub) — Lattice's skills/agents/rules are not packaged as portable artifacts

**Verdict on platform-agnosticity:** Lattice's *pattern* (the seven-piece taxonomy + the failure-mode framing) is platform-agnostic in principle, and the worked translation to Datagrok in `harness-for-datagrok.md` shows the mapping concretely. But the *specific composition* — DAG executor + verdict registry + reconciler + two-round arbiter + algorithm-defensibility gate + concurrency hygiene — is novel as a unit. No surveyed system implements more than two or three pieces of this. The strongest precedent for a "harness as a generalizable framework" is OpenHands' SDK (event-driven, composable agents, microagent knowledge layer), which has shipped to many users and has published benchmarks; but it lacks the verdict registry, the two-round peer review, the reconciler, and the concurrency hygiene. **Lattice's claim should be: "we implement a unique composition of patterns, several of which have precedent in the field, and several of which don't." Not "we are the only harness."**

## Five-to-seven design lessons Lattice could adopt from the comparison

1. **Mechanically-extracted repo map (Aider).** Lattice's knowledge layer is hand-curated typed YAML. Aider's repo map is tree-sitter + graph-centrality + token budget. The two are complementary — for Datagrok plugin development specifically, a repo map of `grok` / `ui` / `dg` namespace usage across the public reference packages would be more sustainable than a hand-curated component map. Borrow recommendation: **add a tree-sitter-based repo digest as a passive context provider for synthesize and design skills**, not as a replacement for the typed-fact graph.

2. **Conditional rule activation via YAML frontmatter (Cline, Cursor, OpenHands).** Lattice's design-decisions.md is always-loaded. Decomposing it into per-rule `.mdc` files with `alwaysApply` / glob / agent-requested predicates would cut always-on prompt tokens by an estimated 50-70% and let component-specific rules load only when in scope. Borrow recommendation: **migrate `.claude/rules/*.md` to `.cursor/rules/*.mdc`-style format**, retaining the always-on default for the master rule files (CLAUDE.md, the seven-piece taxonomy) and conditional-loading the per-component tables.

3. **Per-cycle append-only event log (OpenHands).** Lattice's `.lattice/decisions.log` is one log across all cycles. A per-cycle event log (every skill invocation, every gate check, every state-file write, every hook outcome) would make cycles replayable from checkpoints. Borrow recommendation: **add `.lattice/cycle-events/{topic}.jsonl` written by every skill node and consulted by the reconciler when state-file drift is detected.**

4. **Within-turn architect/editor split (Aider).** Lattice's implement skill currently both designs and edits within the build cycle. Aider's architect-mode benchmark gain (~5-7 percentage points) suggests splitting the implement skill into a "design the change" sub-step and a "produce the diff" sub-step, with different model choices, would measurably improve build quality. Borrow recommendation: **probe the implement skill's current behavior on a calibrated benchmark (the validation ratchet?) with and without an architect/editor split before committing to the change.**

5. **Trained critic model for review (OpenHands inference-time scaling).** Lattice's review sub-agents are LLM-prompted and bear an attestation cost on every cycle. Once Lattice has accumulated a few hundred review outcomes in `decisions.log`, training a small critic model on those outcomes (PASS/SIMPLIFY/REJECT/SCIENCE-FLAG against the artifact) is a natural next step. Borrow recommendation: **defer until the corpus is large enough; flag as a deferred upgrade in the harness roadmap.**

6. **Block-distribution model (Continue Hub).** Lattice today is a project-internal `.lattice/` tree. Datagrok-side distribution would benefit from packaging skills/agents/rules as portable blocks. Borrow recommendation: **scope a "Lattice block" format (manifest + skill files + verdict-enum extension) for the Datagrok translation, even if Lattice itself doesn't yet need it.**

7. **PR-level enforcement gate complementing pre-commit (Continue, Cursor Background Agents).** Lattice's commit gate fires at `git commit`; a developer with `--no-verify` or a misconfigured machine can bypass it. A PR-level GitHub Action that re-runs the review gate against the diff catches this. Borrow recommendation: **author a `lattice-review-gate.yml` GitHub Action that re-runs the review-gate validators against any PR, scoped initially to gate the merge of `master`-bound commits.**

---

## Open questions for thread discussion

1. **Should Lattice publish a harness-quality benchmark?** No surveyed system has one. Defect-recurrence rate, scope-creep rate, and self-review false-pass rate are all measurable on Lattice's own corpus (BUG-SWEEP.md retrospectives, build-cycle commits, peer-review outcomes). Without published numbers, the "we mitigate failure mode N" claims are unfalsifiable. Question: which 3-4 metrics would be most credible, and is the corpus large enough yet?

2. **Is the verdict-enum registry pattern worth packaging as a standalone artifact?** It has no precedent in the surveyed field, and it's the lightest-touch piece of Lattice's enforcement layer. A standalone TypeScript library that loads YAML, validates gate references against producer enums, and exposes a runtime API would be portable to any agent framework, not just Claude Code. Question: is this worth productizing as `@lattice/verdict-enums` or similar?

3. **How does the harness-pattern story scale to teams >1?** Lattice's documented origin is a single developer over four months. Every concurrency-hygiene piece (locks, staging-drift, commit-intent) is sized for that regime. Multi-developer teams introduce *cross-developer* concurrency: two developers on different machines, both with autopilot running, both committing to `master`. The hooks fire locally; they don't coordinate. Question: does the harness pattern need a server-side coordination layer, or is the PR-level enforcement (Q1's GitHub Action) sufficient?

4. **Should the "repo map" pattern be adopted now or deferred?** Aider's tree-sitter-based map is well-validated for code editing. Lattice's typed-fact graph is well-validated for domain claims. The question is whether they coexist or one subsumes the other. Question: is the repo map an addition (passive context for synthesize/design) or a replacement for the un-typed registries (methods-index.md, vehicle-profiles.md)?

5. **Where does the "harness as a Datagrok product" boundary sit?** The worked translation in `harness-for-datagrok.md` maps Lattice pieces onto existing Datagrok artifacts (function metadata, `grok check`, webpack externals). The Datagrok team could consume Lattice as (a) a project template they fork, (b) a Claude Code plugin distributed via npm, (c) a first-class Datagrok platform feature. Each has different boundary commitments. Question: which boundary is the Datagrok team aiming at, and does the harness's framework-vs-substance split survive each option intact?

---

## Sources

**Group 1 — Open-source agentic dev frameworks:**

- [github.com/Aider-AI/aider](https://github.com/Aider-AI/aider) — Aider repo README; vendor positioning, integration claims.
- [aider.chat/docs/repomap.html](https://aider.chat/docs/repomap.html) — repo map architecture: tree-sitter symbol extraction, PageRank-style ranking, `--map-tokens` budget.
- [aider.chat/2024/09/26/architect.html](https://aider.chat/2024/09/26/architect.html) — architect mode design rationale and 2024 benchmark numbers (o1-preview pairings on edit benchmark).
- [aider.chat/docs/leaderboards/](https://aider.chat/docs/leaderboards/) and [llm-stats.com/benchmarks/aider-polyglot](https://llm-stats.com/benchmarks/aider-polyglot) — current polyglot leaderboard numbers (GPT-5 88.0%, Claude Opus 4.5 89.4%).
- [aider.chat/docs/config/aider_conf.html](https://aider.chat/docs/config/aider_conf.html) — `.aider.conf.yml` schema, CONVENTIONS.md loading.
- [github.com/cline/cline](https://github.com/cline/cline) — Cline README; tool surface, human-in-the-loop GUI claim.
- [docs.cline.bot/features/plan-and-act](https://docs.cline.bot/features/plan-and-act) — Plan/Act mode separation, state transfer.
- [docs.cline.bot/customization/cline-rules](https://docs.cline.bot/customization/cline-rules) — `.clinerules/` markdown system, conditional YAML frontmatter.
- [github.com/continuedev/continue](https://github.com/continuedev/continue) — Continue repo README; CI-checks pivot.
- [docs.continue.dev/](https://docs.continue.dev/) and [docs.continue.dev/ide-extensions/agent/how-it-works](https://docs.continue.dev/ide-extensions/agent/how-it-works) — agent mode, blocks, context providers, hub.
- [github.com/SWE-agent/SWE-agent](https://github.com/SWE-agent/SWE-agent) — SWE-agent repo; SWE-bench claims, mini-swe-agent 65% in 100 LOC.
- [swe-agent.com/latest/background/architecture/](https://swe-agent.com/latest/background/architecture/) — SWEEnv, Agent.forward(), HistoryProcessor, ACI tool installation.
- [arxiv.org/abs/2405.15793](https://arxiv.org/abs/2405.15793) — original SWE-agent paper: ACI thesis, 12.5% SWE-bench pass@1, 87.7% HumanEvalFix.
- [github.com/All-Hands-AI/OpenHands](https://github.com/All-Hands-AI/OpenHands) — OpenHands repo README; SWE-bench 77.6% badge, SDK / Local GUI / Cloud tiers.
- [docs.openhands.dev/sdk/arch/agent](https://docs.openhands.dev/sdk/arch/agent) — V1 SDK architecture: stateless Agent, EventLog, Workspace, LiteLLM wrapper.
- [openhands.dev/blog/sota-on-swe-bench-verified-with-inference-time-scaling-and-critic-model](https://openhands.dev/blog/sota-on-swe-bench-verified-with-inference-time-scaling-and-critic-model) — Nov 2025 SOTA via trained critic + inference-time scaling.
- [docs.openhands.dev/openhands/usage/microagents/microagents-repo](https://docs.openhands.dev/openhands/usage/microagents/microagents-repo) — three-tier microagent loading (global / user / workspace), trigger keywords.
- [github.com/smol-ai/developer/blob/main/readme.md](https://github.com/smol-ai/developer/blob/main/readme.md) — smol-developer README; <200 LOC, three-stage pipeline, debugger.py companion.
- [cursor.com/docs](https://cursor.com/docs) — Cursor official documentation index (closed source).
- [cursor.com/blog/agent-best-practices](https://cursor.com/blog/agent-best-practices) — Cursor agent mode, MCP integration constraints.
- [forum.cursor.com/t/how-do-i-configure-a-global-rules-file-that-gets-picked-up-by-agent-mode/157335](https://forum.cursor.com/t/how-do-i-configure-a-global-rules-file-that-gets-picked-up-by-agent-mode/157335) — community thread on Project Rules format and `.mdc` activation modes.
- [www.morphllm.com/cursor-agent-mode](https://www.morphllm.com/cursor-agent-mode) — third-party walkthrough of Cursor agent mode and Background Agents.

**Group 2 — BI plugin platforms:**

- [tableau.github.io/extensions-api/](https://tableau.github.io/extensions-api/) — Tableau Extensions API docs; `.trex` manifest, viz-extension GA in 2025.1.
- [github.com/tableau/extensions-api](https://github.com/tableau/extensions-api) — sample code, TypeScript types library, sandbox dev environment.
- [community.spotfire.com/articles/spotfire/spotfire-mods-overview/](https://community.spotfire.com/articles/spotfire/spotfire-mods-overview/) — Spotfire Mods overview; viz vs action mods, signing trust model.
- [github.com/spotfiresoftware/spotfire-mods](https://github.com/spotfiresoftware/spotfire-mods) — Spotfire Mods SDK repo.
- [npmjs.com/package/@spotfire/mods-sdk](https://www.npmjs.com/package/@spotfire/mods-sdk) — Mods SDK CLI tool.
- [learn.microsoft.com/en-us/power-bi/developer/visuals/develop-power-bi-visuals](https://learn.microsoft.com/en-us/power-bi/developer/visuals/develop-power-bi-visuals) — Power BI custom visuals authoring; pbiviz CLI, IVisual interface.
- [learn.microsoft.com/en-us/power-bi/developer/visuals/environment-setup](https://learn.microsoft.com/en-us/power-bi/developer/visuals/environment-setup) — pbiviz environment, sandbox constraints.
- [dax.tips/2025/09/29/create-custom-visuals-in-power-bi-with-github-copilot/](https://dax.tips/2025/09/29/create-custom-visuals-in-power-bi-with-github-copilot/) — Phil Seamark blog post on Copilot for Power BI custom visuals (closest first-party AI-assist signal).
- [docs.streamlit.io/develop/concepts/custom-components](https://docs.streamlit.io/develop/concepts/custom-components) — Streamlit Components overview; static vs bidirectional.
- [github.com/streamlit/component-template](https://github.com/streamlit/component-template) — component template repo (React + reactless).

**Lattice corpus (already known, cited for vocabulary):**

- `C:/pg/lattice/README.md` — seven-piece taxonomy, nine failure modes, three transferability layers.
- `C:/pg/lattice/docs/harness-for-datagrok.md` — five-level enforcement ladder, three-mode cycle structure, Skills/Roles/Agents/Teams disambiguation, instruction-vs-behavior trap.
