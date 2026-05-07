# 06 — Questions for Discussion

> **Audience:** Datagrok engineers + Lattice maintainer (Larisa) considering whether and how to adopt a Lattice-shape agentic dev harness for plugin authoring.
>
> **Reading order:** if you read nothing else, read **§1 (the testable claim)** and **§2 (the recommended architecture)**. The rest is questions to drive the thread.

---

## 1. The testable claim

The kickoff structure (drawn as the SVG that started this research) is a three-pillar architecture for an agentic dev harness:

- **Platform pillar (Datagrok)** — DG reference, plugin scaffolds, `grok check`, publish gate. **One per platform** — Datagrok's platform team authors and maintains it; every DG plugin consumes the same artifact.
- **Harness pillar (Lattice)** — Skills, reviewer agents, workflow runner, orchestrator, hooks + locks. **One total** — shared across every project everywhere. This is the load-bearing claim.
- **Project pillar (one per plugin)** — domain knowledge, project state, test fixtures, harness config. **N pillars, one per plugin.** SENDEX is plugin #1.

**The testable claim:** the harness pillar contains zero DG-specific references. Swap the Platform pillar (DG → Tableau, Spotfire, no-platform-at-all) and the Harness shape stays constant. Add a new Project pillar (plugin #2, #3, ...) and the Harness shape stays constant. **If anyone wants to push back on this claim, that's the conversation worth having.**

**Verdict from the research** (full version in `08-architecture-recommendation.md`):

| Layer | Survives? |
|---|---|
| Executor (16 TS files) | YES — 2 single-line path hardcodes + 1 informational comment; all single-line fixes |
| Workflows (10 YAML) | YES — one classification prompt + one permitted-sources list, both parameterizable |
| Hooks + locks + agents + verdict-enum registry | YES — fully harness-pillar |
| Skills (34 prompts) | **PARTIALLY** — 22 of 34 donatable as-is or with the schema contract; 6 HEAVY (substantial re-authoring); 1 fundamental (`ops/explore-data.md`) |
| Scripts (25) | PARTIALLY — 21 of 25 harness-grade or parameterizable |

**Bottom line:** ~76% of Lattice ships as harness-pillar with the schema contract; ~24% is non-trivially SENDEX-coupled. The claim survives if "harness pillar" is defined by the **carve-out** described in `05-lattice-extraction.md` §7.4, not by the current directory structure.

---

## 2. The recommended architecture (one paragraph)

Carve `lattice-core/` out of today's Lattice repo as a vendored library. Both SENDEX and Datagrok depend on it. Two manifest files glue everything together: **`lattice-project.toml`** at the project root declares where each project-graph component lives (TODO, knowledge files, design rules, runtime commands); **`lattice-platform.toml`** at the platform root declares where DG-specific extension points live (build validator command, scaffold templates, publish flow, contract triangles). DG-specific skills (`add-viewer`, `wire-detector`, etc.) live in a sibling skill pack `commands/datagrok/` — they are not part of the harness pillar. An `audit-harness-pillar.py` script enforces the platform-agnostic claim mechanically.

Full details: `08-architecture-recommendation.md` §3-§5.

---

## 3. Question buckets

Six discussion buckets. Each carries 3-5 questions. Each question carries a one-line "why this matters" so a thread reader can scan for the bits they care about.

---

### Bucket A — Is the testable claim a commitment or a hypothesis?

A1. **Should the harness pillar's platform-agnosticism be a hard architectural commitment (mechanically enforced) or a working hypothesis (defended by evidence on each project)?**
*Why this matters:* a commitment requires the `audit-harness-pillar.py` script and treats DG-specific tokens in `lattice-core/` as build-blocking defects. A hypothesis allows DG-specific code in shared trees so long as it's documented. The commitment is more rigorous; the hypothesis is more permissive. Pick one — the mechanism follows.

A2. **What's the deny-list for the harness-pillar audit?**
*Why this matters:* tokens like `pcc`, `sendex`, `pointcross`, `unified_findings.json`, `noael`, `syndrome`, plus DG-specific tokens like `grok_check`, `JsViewer`, `DG.SEMTYPE`, `package.g.ts`. The list goes in `lattice-platform.toml [audit] deny_list`. If the list is short, the audit is permissive; if long, more drift is caught. What's the right floor?

A3. **Does platform-agnostic mean "can swap DG for Spotfire" or "can swap DG for nothing" (i.e., the harness works for non-plugin projects)?**
*Why this matters:* the stronger interpretation — harness works for any project — is what the user's SVG draws. The weaker — harness works for any DG-target consumer — is what the workplan's W1 envisions. They have different test surfaces. Lattice-on-SENDEX-without-Datagrok is the second test case; that probably has to pass to defend the strong claim.

A4. **If the carve-out reveals that 24% of Lattice doesn't generalize, is the harness pillar still valuable, or is the right framing "Lattice was Lattice; the next harness is fresh"?**
*Why this matters:* sunk-cost honesty. If 6 HEAVY skills + 1 fundamental skill have to be re-authored *per plugin* (the platform pack may optionally ship DG-flavored skeletons, but each plugin still customizes for its domain), the carve-out is mostly the executor + workflows + agents + scripts. That's still meaningful (per `03-comparable-frameworks.md` cross-cutting §3 — none of the 8 surveyed systems implement Lattice's executor/reconciler/two-round-review composition) but it's a different value proposition than "drop Lattice in, ship plugins."

---

### Bucket B — The harness/project schema contract

B1. **Is `lattice-project.toml` required from day one, or opt-in with SENDEX defaults as fallback?**
*Why this matters:* required-from-day-one breaks SENDEX until it ships the file. Opt-in preserves SENDEX velocity but doesn't move the platform-agnostic claim forward. Strawman: required, with a generated template via `scaffold/lattice-project.toml`. SENDEX ships the file in the same commit as the executor TOML loader.

B2. **TOML, YAML, or JSON?**
*Why this matters:* TOML has best comments + diff ergonomics. YAML matches existing `cycle-state` files. JSON is the worst (no comments, surprising errors). The choice doesn't affect the contract; it affects authoring experience. Strawman: TOML. (`04-project-graph.md` §6.4)

B3. **What's the right granularity for `[knowledge.registries]`?**
*Why this matters:* SENDEX has 6 registries (methods, fields, species, vehicle, contract-triangles, dependencies). A Datagrok plugin might have a different 6 (api-namespaces, semtypes, viewer-types, package-roles, ...). Named keys force the platform-agnostic question upfront; a free-form dict defers it. Forcing it makes the contract testable.

B4. **What's the migration order across the executor + scripts + skills?**
*Why this matters:* lowest-risk first migration is `executor/src/reconcile.ts:177` (one line). Highest-volume migration is the 32 skill files. Audit scripts (`audit-corpus-citations.py`) are project-side per Lattice's own design and arguably should not migrate at all (they belong in `scaffold/scripts/` as templates). Strawman path: TOML loader → executor migrations → script-template migrations → skill-prompt migrations. (`04-project-graph.md` §7)

B5. **How does the harness behave when the contract names a path that doesn't exist?**
*Why this matters:* today's `executor/src/todo-queue.ts:findTodoFile` returns `null` when no candidate path matches — fail-soft. Should the harness fail-loud when `[backlog] todo` is named but missing? Strawman: fail-loud at startup (`lattice status` prints "Configured TODO at X but file is absent"); read sites treat absence as empty rather than crashing.

---

### Bucket C — The harness/platform adapter contract

C1. **Is `lattice-platform.toml` separate from `lattice-project.toml`, or one file?**
*Why this matters:* separate is right when many plugins share a platform (DG case — 76 plugins, one DG manifest). One file is right when each project authors everything itself (non-platform case — solo project). Strawman: separate files; project manifest can override platform manifest values for cases where a plugin has special needs. (`08-architecture-recommendation.md` §3a-§3b)

C2. **`grok check` has no JSON output today. How does the harness wire it into pre-commit?**
*Why this matters:* per `01-platform-jsapi.md` §3.4, three options: (a) scrape stdout, (b) accept "exit 0 = pass" as the only signal, (c) invoke the underlying functions directly (they ARE exported — 9 names enumerated). Option (c) is the most reliable and lets the harness produce structured output for the review-gate attestation format. Datagrok engineering decision: ship structured output as part of `grok check`'s next minor release, vs. accept the workaround as permanent.

C3. **Where does the `query-knowledge.py` interface contract live?**
*Why this matters:* `[knowledge.query.command]` names the script, but the harness needs to know the script accepts `--scope`, `--kind`, `--domain` and emits a specific stub on no-match. That contract lives implicitly in skill prompts today. Strawman options: (a) ship a JSON-schema reference (`[knowledge.query] schema = ".lattice/query-knowledge-schema.json"`), (b) version the interface in `lattice-project.toml`, (c) ship a reference implementation in `scaffold/scripts/`.

C4. **Does Datagrok actually want the typed knowledge graph layer at all?**
*Why this matters:* Lattice's typed-fact graph is wired into peer-review, architect, lint-knowledge, audit-knowledge-graph at minimum — 5 surfaces. A Datagrok adoption that takes the executor + workflows but skips the typed-fact graph would lose the algorithm-defensibility gate (Lattice's #1 differentiator per `harness-for-datagrok.md` §6.9). Strawman: typed-fact graph is opt-in via `lattice-project.toml [knowledge] typed_graph`; if absent, peer-review F3 falls back to "literature citation only."

---

### Bucket D — Skill set design

D1. **Should the harness pillar's skill list contain a `dg-` prefix anywhere?**
*Why this matters:* per `07-proposed-skills.md` §5, every time the `dg-` prefix is proposed (`dg-architect`, `dg-publish`, `dg-bug-stress`), the placement test relocates the skill to either the platform pack (where the prefix is implied) or to per-project (where it's specific to that plugin's domain). Strawman: zero `dg-` prefixes in the harness pillar — if a skill in `commands/lattice/` carries one, the placement is wrong.

D2. **Where does `prepare-release` live?**
*Why this matters:* it's the most ambiguous case. The SHAPE is "run the platform's release pipeline." The substituted commands look DG-shaped (`grok api && grok check --strict && webpack && grok publish --release`). Strawman: harness pillar; the skill body uses `{{platform.publish.command}}` exclusively; never names `grok` literally. Does that survive a code-review smell test?

D3. **What's the right home for the W3.C1 view-port skill (`port-view`)?**
*Why this matters:* the workplan defers W1.B4 skills until W3.C1 reveals the work. `port-view` is candidate for first-built. Strawman: don't ship it — re-frame W3.C1 as `/lattice:build-cycle` consuming an `incoming/spec-port-{view-name}.md` synthesized from the existing SENDEX view's spec. Test the spec-driven path before introducing a port-shape skill.

D4. **Should the platform pack ship a generic `register-platform-entity.md` instead of separate `wire-detector` / `add-viewer` / `add-function`?**
*Why this matters:* the pattern is "register an entity in the platform's discovery mechanism." Streamlit / PowerBI / Spotfire all have an analog. Generalizing one skill across registration surfaces could collapse 4 skills into 1. Counter-argument: the entity-templates differ enough that a generic skill becomes a dispatcher with no real shared logic. Worth a strawman implementation to see.

D5. **How do per-project HEAVY-skill re-authorings stay in sync with harness-pillar skill structure changes?**
*Why this matters:* when `commands/lattice/review.md` SHAPE updates (new section, changed verdict enum), each plugin's project-side `review.md` needs to track. The deliverable proposes a concrete mechanism in `07-proposed-skills.md` §8.1 (added during R1 incorporation): version-keyed declaration `[skills.<name>] harness_version` in `lattice-project.toml` + a `validate-skill-shape.sh` structural test that asserts the project skill body contains the harness's required structural anchors + integration into `sync-skills.sh --validate`. **Open thread question:** is the version + structural-test combo sufficient, or does the team prefer the alternative (Jinja-templated skills) given the trade-off (heavier mechanism, but eliminates drift class entirely)?

---

### Bucket E — Extraction strategy and governance

E1. **Vendor (separate `lattice-core` library both consumers depend on) vs. fork (Datagrok forks Lattice) vs. in-place (single repo, refactored)?**
*Why this matters:* per `05-lattice-extraction.md` §7, vendor wins on every dimension except short-term time-to-port. Forks rot; in-place defers governance. Strawman: in-place reorg as Phase 0, vendor as Phase 1.

E2. **Where does `lattice-core` live as a repo?**
*Why this matters:* options: (a) keep it under Larisa's namespace and Datagrok depends; (b) move to `datagrok-ai/lattice-core`; (c) third-party repo with both as contributors. Each has governance implications. Workplan open question 3 (`datagrok-harness-workplan.md:202`) — unresolved.

E3. **Who is the Harness Architect (W1.A5)?**
*Why this matters:* per the workplan, A5 is the prerequisite for everything else. Without an owner, W1.B items don't move and the week-4 gate fails. Naming someone is the load-bearing kickoff decision.

E4. **What's the budget for the 1-month gate window?**
*Why this matters:* roughly 2 engineers part-time across W1.A1, A2, B1-B3 + governance. If the team can't commit it, restructure the gate before kickoff (per workplan risk row 1).

E5. **What's the Datagrok core team's appetite for adopting Lattice's failure-mode framing?**
*Why this matters:* Lattice's nine LLM failure modes (`harness-for-datagrok.md` §2.1-§2.9) are the *philosophical anchor* for the whole harness. A team that doesn't share the diagnosis ("self-review is worthless," "rule-drift under task pressure," "fabrication needs tool calls as proof") will end up with a different-shape harness even if they take the executor. Worth surfacing the framing explicitly so adoption is informed.

---

### Bucket F — Open precedent and what to learn from neighbors

F1. **None of the 8 surveyed agentic dev frameworks implements Lattice's commit-trailer reconciler. Is that a strength or an artifact of Lattice having one maintainer who needed it?**
*Why this matters:* per `03-comparable-frameworks.md` cross-cutting §3, the commit-trailer reconciler + four-layer authoritativeness ladder is the deepest delta. It's also the design choice that requires the most discipline (every commit needs `Topic:`). If DG plugin authors won't adopt the discipline, the reconciler doesn't fire and Lattice loses its strongest differentiator.

F2. **OpenHands (Nov 2025 inference-time-scaling-with-trained-critic) is structurally close to Lattice's two-round-peer-review. Should Lattice borrow anything from their design?**
*Why this matters:* OpenHands' microagent knowledge layer (three tiers — repo-scoped, knowledge-scoped, conversation-scoped) is a richer shape than Lattice's flat `.claude/rules/`. Cline's conditional rule activation via YAML frontmatter is similar. Both could collapse Lattice's always-loaded design tables (~2000 tokens of frontend-ui-gate.md + design-decisions.md) into context-conditional loading. Borrow candidate.

F3. **mini-swe-agent hits 65% on SWE-bench Verified in 100 lines of Python with no harness layers. What does Lattice-on-DG offer beyond that floor?**
*Why this matters:* uncomfortable data point. The harness layer's value has to clear "the 100-line baseline can't do." Lattice's answer: durable cross-session memory, two-round peer review, mechanical enforcement of project-side knowledge, concurrent-session safety. Each is testable empirically against SENDEX's 4-month track record. The thread should sanity-check that the value-delta is real for DG plugins specifically, not just for SENDEX-shape projects.

F4. **No surveyed BI plugin platform (Tableau, Spotfire, PowerBI, Streamlit) ships a first-party agentic-dev story. Is that gap an opportunity or a contraindication?**
*Why this matters:* per `03-comparable-frameworks.md` Group 2, the BI peers all assume human plugin authors. The opportunity reading: Datagrok could differentiate by shipping the agentic-dev story first. The contraindication reading: maybe the BI plugin authoring market doesn't pull for this hard enough to fund the work. Worth naming the bet explicitly.

---

## 4. Document map

| File | What's in it |
|---|---|
| `README.md` | Index + executive summary + reading order |
| `01-platform-jsapi.md` | Datagrok JS API surface, class hierarchy, function-metadata grammar, `grok check` 9-check enumeration, decorator runtime-noop finding, help-doc agent-readability inventory |
| `02-plugin-scaffolds.md` | `grok create` template walkthrough, 5-package sample patterns, `grok add` mutation strategies, what an empty plugin can do |
| `03-comparable-frameworks.md` | 8 systems compared (Aider, Cline, Continue, SWE-agent, OpenHands, Smol-developer, Cursor, mini-swe-agent + Tableau/Spotfire/PowerBI/Streamlit), cross-cutting observations on what's universal vs unique to Lattice |
| `04-project-graph.md` | What the project graph is, where SENDEX puts it today, alternatives to markdown-on-disk, `lattice-project.toml` schema sketch |
| `05-lattice-extraction.md` | Per-skill / per-agent / per-workflow / per-script / per-executor-file SENDEX-coupling audit; fork/vendor/in-place scoring; verdict on the testable claim |
| `06-questions-for-discussion.md` | This file |
| `07-proposed-skills.md` | Placement test + skill triage; harness-pillar / platform-pillar / project-pillar split; rejected `dg-*` names |
| `08-architecture-recommendation.md` | Single-page synthesis: claim verdict, recommended contract, extraction sequence, enforcement mechanism |

---

## 5. Reading order suggestion

For a Datagrok engineer with limited time:

1. This file (`06`) — what's being asked
2. `08-architecture-recommendation.md` — the recommendation
3. `05-lattice-extraction.md` §7-§8 — the extraction strategy
4. Skim `04-project-graph.md` §6 — the schema contract sketch

Total: ~30 minutes. Beyond that, sample `01`, `02`, `03` per personal interest area.

For Lattice maintainer (Larisa):

1. `05-lattice-extraction.md` end-to-end — the full SENDEX-coupling audit
2. `04-project-graph.md` §5-§7 — the migration path
3. `07-proposed-skills.md` — what changes in the skill set
4. `08` — the recommendation summary
5. This file as the thread input
