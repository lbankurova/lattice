# Datagrok agentic dev harness — research deliverable

> **Topic:** generalizing Lattice from a SENDEX-specific agentic dev framework into a **platform-agnostic harness** for Datagrok plugin development.
>
> **Frame:** three-pillar architecture (Platform / Harness / Project), three cycles (spec-driven / spike / bug-fix), with reviewer agents + grok-check firing on Build and Verify.
>
> **Pillar cardinality** (this is the load-bearing distinction): the **Harness** is **one** artifact, shared across every project everywhere. The **Platform** pillar is **one per platform** — Datagrok's platform team authors a single `lattice-platform.toml` + `commands/datagrok/` skill pack consumed by every DG plugin. The **Project** pillar is **N** — one per plugin, each authoring its own `lattice-project.toml` + domain knowledge + re-authored HEAVY skills. SENDEX is plugin #1.
>
> **Testable claim being evaluated:** *the harness pillar contains zero DG-specific references. Swap the Platform pillar (DG → Tableau, Spotfire, no-platform-at-all) and the Harness shape stays constant. Add a new Project pillar (plugin #2, #3, ...) and the Harness shape stays constant.*
>
> **Verdict:** **PARTIALLY survives** — the claim holds when the harness pillar is defined by the post-extraction carve-out (~76% of today's Lattice), not by the current directory structure. The remaining ~24% is concentrated in 6 HEAVY skill prompts whose SHAPE is generic but whose worked examples are SENDEX-shape. Full reasoning in `08-architecture-recommendation.md`.

---

## Executive summary (5 paragraphs)

**1. Most of Lattice ports cleanly; the highest-frequency-use skills don't.** Per `05-lattice-extraction.md`, today's Lattice has 18 of 34 skills (53%) non-trivially SENDEX-coupled. The **projected** post-carve-out harness-pillar bundle would be ~76% of Lattice by file count — but that excludes the 6 HEAVY skills that are SENDEX's daily-driver tools (`review`, `design`, `lint-knowledge`, `lit-triage`, `ops/check`, `ops/bug-stress`). The executor itself is functionally clean (2 single-line path hardcodes + 1 informational comment), all 10 workflows are donatable, all 4 reviewer agents are clean except for example phrasing, and 16 of 25 scripts are harness-grade. The harness primitives — verdict-enum registry, two-round peer review with bikeshed/persistent-FLAWED arbiters, commit-trailer reconciler, four-layer authoritativeness ladder, atomic state writes with revision checks, lock hygiene, the architect-reviewer / decision-auditor / post-impl-reviewer agent set — have no precedent at the *specific implementation pattern* level across 8 surveyed agentic dev frameworks (`03-comparable-frameworks.md`); equivalent mitigations exist via different mechanisms (OpenHands' container isolation, SWE-agent's action parser, etc. — see Peer Review Notes §F-4 below).

**2. The coupling concentrates in skill prompts.** 6 of 34 skills are HEAVY-coupled to SENDEX: `review.md` (declares "You are the Review Agent for SENDEX"), `design.md` (CT-N theme references), `lint-knowledge.md` (hardcoded venv path + audit-script list), `lit-triage.md` (tox literature triage rules), `ops/check.md` (hardcoded `C:/pg/pcc/frontend` and SENDEX engine module list), `ops/bug-stress.md` (tox pattern families). 1 skill is fundamentally tox-coupled (`ops/explore-data.md`). 17 skills are path+domain-term coupled and parametrizable via the schema contract.

**3. The contract is two TOML files plus a sibling skill pack.** `lattice-project.toml` at the project root declares where each project-graph component lives (TODO, knowledge files, design rules, runtime commands, validation references) — collapsing the 8 categories of coupling defects (`04-project-graph.md` §5.3) into a single audit surface. `lattice-platform.toml` at the platform root declares DG-specific extension points (build validator command, scaffold templates, publish flow, contract triangles) so plugin authors don't re-author them per project. DG-specific skills (`add-viewer`, `wire-detector`, etc.) live in `commands/datagrok/` — a sibling skill pack the harness discovers via convention. Full schema sketches in `04-project-graph.md` §6 and `08-architecture-recommendation.md` §3.

**4. The recommended path is in-place reorg → vendor library → DG sibling pack.** Phase 0 refactors today's single repo so harness-pillar code lives in one tree; SENDEX consumes the new schema contract. Phase 1 carves `lattice-core/` as a vendored library both SENDEX and Datagrok depend on. Phase 2 (parallel with workplan W1.A1/A2) authors the DG sibling skill pack. The work decomposes by owner: Lattice maintainer, Datagrok platform team, plugin author. Calendar arithmetic is for the team that owns each line — out of scope for this research. Sequencing and dependency graph in `08-architecture-recommendation.md` §4 (revised). Forks rot at high cadence (heuristic, not measured); pure in-place defers governance. Vendor wins at n≥3 consumers; at n=2 the overhead is comparable to fork-rot — reassess at plugin #2.

**5. Enforcement of the platform-agnostic claim is mechanical.** An `audit-harness-pillar.py` script (proposed in `07-proposed-skills.md` §4.6) scans `lattice-core/` for any token in a configured deny-list (SENDEX names, DG-specific identifiers, project-specific paths) and fails the build if found. Without this audit, the claim drifts; with it, the claim is enforceable. Lattice already has the pattern (`audit-knowledge-graph.py`, `audit-corpus-citations.py`). This is the carve-out audit in the same shape.

---

## File index

| File | Purpose | Lines |
|---|---|---:|
| `README.md` | Index + executive summary + reading order | this file |
| `01-platform-jsapi.md` | Datagrok JS API surface, class hierarchy, `grok check` 9-check enumeration, function-metadata grammar, decorator runtime-noop finding, help-doc inventory | 650 |
| `02-plugin-scaffolds.md` | `grok create` template walkthrough, 5-package patterns, `grok add` mutation strategies | 464 |
| `03-comparable-frameworks.md` | 8 systems compared (Aider, Cline, Continue, SWE-agent, OpenHands, Smol-dev, Cursor, mini-swe-agent + Tableau, Spotfire, PowerBI, Streamlit Components), cross-cutting observations | substantial |
| `04-project-graph.md` | Where the project graph lives, schema contract, `lattice-project.toml` sketch | 487 |
| `05-lattice-extraction.md` | Per-file SENDEX-coupling audit; fork/vendor/in-place scoring; verdict on the testable claim | 368 |
| `06-questions-for-discussion.md` | Bucketed question list ready for thread discussion | this set |
| `07-proposed-skills.md` | Placement test + skill triage; harness-pillar / platform-pillar / project-pillar split; rejected `dg-*` names | this set |
| `08-architecture-recommendation.md` | Single-page synthesis: claim verdict, recommended contract, extraction sequence, enforcement mechanism | this set |
| `peer-reviews/` | R1 + R2 fresh-context peer reviews of the deliverable | populated by Step 2/4 of the research cycle |

---

## Already known (cite-and-build)

This research is additive to three existing Lattice docs. Each is the foundation for one or more sections; none is duplicated.

- **`C:/pg/lattice/README.md`** — defines the seven-piece harness taxonomy (skills / sub-agents / workflows / hooks / state / audits / knowledge), the nine LLM failure modes, the three transferability layers (Process / Platform / Scientific), and the worked Datagrok translation table at lines 283-297. **Used by:** every file. **Extended by:** `01` adds file:line anchors below the table's "exists" granularity; `05` audits whether each donation in the table is actually as donatable as the table claims.
- **`C:/pg/lattice/docs/datagrok-harness-workplan.md`** — kickoff workplan with the donation table, three workstreams (W1=harness, W2=Lattice donations, W3=SENDEX port), 1-month gate criteria. **Used by:** `06`, `07`, `08`. **Extended by:** `06` references the open questions and fills in architectural questions the workplan doesn't pose; `07` validates the W1.B4 candidate skill list against the placement test.
- **`C:/pg/lattice/docs/harness-for-datagrok.md`** — generalization document covering LLM failure modes, cycle structure rationale, skill/role/agent/team disambiguation, five-level enforcement ladder. **Used by:** every file. **Extended by:** `03` uses the same vocabulary to describe comparable systems for apples-to-apples comparison.

---

## Methodology

- **Source-verified.** Every concrete claim about Datagrok cites `path:line` from `C:/datagrok/public/`. Every claim about Lattice cites `path:line` from `C:/pg/lattice/` or `C:/pg/pcc/`.
- **No speculation about closed-source internals.** Cursor, Devin, and Replit Agent are marked `[INFERRED FROM PUBLIC SURFACE]` where the architectural detail is reverse-engineered from configuration knobs.
- **No SENDEX domain content.** The deliverable does not produce new toxicology research, NOAEL/syndrome facts, or SENDEX algorithm specs. This is harness-level meta-research — the substrate Lattice runs on, not the science Lattice supports.
- **Non-algorithmic topic.** Per the research-cycle Step-1 gate, the algorithmic Phase 4 oracle walk does not apply to this topic. Logged in cycle state at `.lattice/cycle-state/dg-agentic-harness.yaml`.
- **Multi-agent parallel research, single-orchestrator synthesis.** Three sub-agents produced files 01-05 in parallel against scoped briefs; the orchestrator synthesized 06-08 + this README from their outputs after all three returned.

---

## Reading order

**For a Datagrok engineer with limited time** (~30 min):
1. This `README.md`
2. `06-questions-for-discussion.md` — what's being asked
3. `08-architecture-recommendation.md` — the recommendation
4. Skim `04-project-graph.md` §6 — the schema contract sketch

**For Lattice maintainer** (~90 min):
1. `05-lattice-extraction.md` end-to-end — full SENDEX-coupling audit
2. `04-project-graph.md` §5-§7 — migration path
3. `07-proposed-skills.md` — what changes in the skill set
4. `08-architecture-recommendation.md` — recommendation
5. `06` as the thread input

**For exhaustive review:**
1. Read in order: 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08
2. The peer-review files in `peer-reviews/` once Step 2/4 of the research cycle runs

---

## Peer Review Notes

R1 peer review completed 2026-05-07; verdict CONDITIONAL with 5 actionable findings (full review at `peer-reviews/dg-agentic-harness-review.md`). All five incorporated; no findings rejected. Summary of revisions:

**F-1 (76% framing).** Executive summary §1 and `08-architecture-recommendation.md` §2 relabeled the 76% figure as **projected post-carve-out**, not current state. Today's Lattice has 53% of skills non-trivially coupled (`05-lattice-extraction.md` §2.3); the 76% emerges only after the extraction defined in `05-lattice-extraction.md` §7.4. The executive summary now leads with this distinction.

**F-2 (TOML scope).** `04-project-graph.md` §6 and `08-architecture-recommendation.md` §4 now split the 8 coupling defects from `04-project-graph.md` §5.3 into two categories:
- **TOML-addressable (Defects 1, 2, 4, 8):** path indirection, fallback defaults, hardcoded venv path. Closed by the TOML loader + template substitution.
- **Re-authoring-required (Defects 3, 5, 6, 7):** SENDEX-specific knowledge filenames in skill prose, module names in cycle classification prompts, project-specific names in audit scripts, SENDEX-specific empirical-claim exemplars. Cannot be closed by TOML alone — each affected skill must be re-authored to use template variables (`{{lattice.knowledge.registries.*}}`) or to drop the SENDEX exemplar.

This rebalances the work decomposition (F-7 below) and removes the false impression that the TOML alone was sufficient.

**F-3 (skill-version contract).** Was an unresolved open question in R1 — now proposed and specified. `07-proposed-skills.md` §8.1 (new) specifies the **skill-version contract**: per-project re-authored HEAVY skills declare `[skills.<name>] harness_version = "0.x"` in `lattice-project.toml`. `lattice-core/` ships a per-skill structural test (`scripts/validate-skill-shape.sh <skill-name> <project-skill-path>`) that asserts the project-side skill body contains the harness's required structural anchors (e.g., `review.md` requires the 7 mandatory `^## NAME` sections — same shape that `write-review-gate.sh` already enforces on the review output today, generalized to a skill-shape test). When `lattice-core` SHAPE evolves, the harness CHANGELOG records a new version; `sync-skills.sh --validate` runs the structural tests against the project's HEAVY skills and reports drift. This is a low-cost addition (one TOML key per HEAVY skill + one shape-test script) that makes drift mechanical.

**F-4 ("no precedent" framing).** `08-architecture-recommendation.md` §6 reframed: Lattice has no precedent for the *specific implementation pattern* of (verdict-enum registry validated at workflow load, two-round PR with bikeshed/persistent-FLAWED arbiters, four-layer authoritativeness ladder + commit-trailer reconciler, full concurrency hygiene as a composition). Equivalent mitigations exist via different mechanisms in surveyed systems:
- **Verdict-enum registry** ↔ SWE-agent's action parser (validates action shape before dispatch).
- **Two-round peer review** ↔ OpenHands' Nov 2025 inference-time-scaling-with-trained-critic (independent reviewer artifact via different mechanism).
- **Concurrency hygiene** ↔ per-container isolation in SWE-agent / OpenHands (architectural enforcement of "no two sessions corrupt the same state").

The novelty claim survives, but at the implementation-pattern level — not as categorical absence of mitigation. `03-comparable-frameworks.md` cross-cutting §2-§3 already documented these equivalents; the synthesis was inadvertently overstated.

**F-7 (work decomposition).** `08-architecture-recommendation.md` §4 now decomposes the work into five owner-keyed sections (harness infrastructure, skill prompt migration, library carve-out, DG platform authoring, per-plugin project pillar) with explicit dependencies and ordering. The original framing conflated harness-side work, DG-team-owned platform authoring, and per-plugin project-pillar authoring as if one party did all three; the revised version names three distinct owners on three distinct timelines. Calendar arithmetic per line is for the team that owns it — out of scope for this research.

**SOUND findings:** F-6 (server-side DG publish validation is partial black box — correctly flagged in `01-platform-jsapi.md` §4.2 and `01` §6 Q1) and LBC-4 (executor cleanliness claim — specific and falsifiable). No revisions needed.

**Persisted gaps from R1:** ENH-08 (skill-version-contract mechanism — now resolved by F-3 fix above; entry will be marked closed in TODO when 07 §8.1 ships), and the project-pillar-authoring data gap from F-7 (resolved by §4 itemization).

### R2 incorporation (second pass, 2026-05-07)

R2 fresh-context peer review (full review at `peer-reviews/dg-agentic-harness-review-r2.md`) confirmed all five R1 CONDITIONALs were addressed and surfaced **6 new findings: 4 CONDITIONAL, 2 SOUND-acknowledged, 0 FLAWED**. Per the research-cycle Step 5 evaluation, the all-CONDITIONAL outcome auto-validates the research; the four R2 CONDITIONALs were addressed in this pass anyway because the fixes were small and concrete:

**R2-F1 (validate-skill-shape.sh heading-only).** Fixed in `07-proposed-skills.md` §8.1b. The shape manifest now declares **two anchor classes** — `required_headings` (the original `^## NAME` regex) AND `required_content_anchors` (free-form regex within named sections). The reviewer's worked case (review.md `## MECHANICAL CHECKS` requiring `[TRIANGLE]` invocation post-v1.2) is now caught by content anchors. Residual gap (paragraph-level semantic drift not catchable by regex) acknowledged with a "last human review" advisory the validator emits.

**R2-F2 (audit-harness-pillar deny-list).** Fixed in `07-proposed-skills.md` §4.6. Added three specification details: (a) deny-list update trigger pinned to platform-SDK semver bump; (b) `lattice_core_version_tested` field with CI-enforced `<=` constraint; (c) file-scope qualifier excluding research/comparison docs from the scan, with `<!-- audit-allow: token -->` exemption marker for intentional comparative references in skill bodies (same pattern as `triangle-audit:exempt`).

**R2-F3 (prepare-release.md package.json prose).** Fixed in `07-proposed-skills.md` §4.4a. Added `{{platform.version.manifest_file}}` template variable (defaults to `package.json`; Python-shipped platforms set it to `pyproject.toml`). Worked example restated. Harness-pillar placement remains correct; the worked example just needed to expose more parameterization than the original draft showed.

**R2-F4 (shape manifest authoring missing from Phase 0 work list).** Fixed in `08-architecture-recommendation.md` §4.1. Added explicit `_shapes/<skill>.shape.yaml` authoring line item — one shape manifest per HEAVY skill. The sequencing concern (plugins re-authoring before shape manifests exist) is closed: shape manifests now ship as part of Phase 0 before any per-plugin work begins.

**R2-F5 (typed-graph opt-in skill conditional, SOUND-acknowledged).** Acknowledged not fixed: the gap is real but properly scoped — the `[knowledge] typed_graph` opt-in mechanism is described as a TOML field in `06-questions-for-discussion.md` §C4 but the deliverable does not trace the conditional fallback through to the peer-review skill's mandatory-invocation language. The fix would require a conditional-section mechanism in skill body substitution (beyond the simple `{{x.y}}` template). Logged as RG-DG-1 (research gap) in the project's REGISTRY.md by the R2 agent; addressed in a follow-up pass when the conditional-section mechanism is implemented.

**R2-F6 (dg-api-index.json generator script, SOUND-acknowledged).** Fixed in `08-architecture-recommendation.md` §4.4. Added api-index generator as a platform-pillar deliverable owned by Platform Tooling Owner. Adding the line item makes the missing piece visible.

**R2 persistence completed by the R2 agent itself:**
- `C:/pg/pcc/.lattice/decisions.log` — R2 entry appended
- `C:/pg/pcc/docs/_internal/research/REGISTRY.md` — `dg-agentic-harness` stream added with 3 open questions (RG-DG-1: typed-graph-opt-in skill conditional; RG-DG-2: deny-list cadence; RG-DG-3: shape-manifest semantic drift)
- `C:/pg/pcc/docs/_internal/TODO.md` — 2 data gaps appended (shape-manifest cost gap closed by R2-F4 fix; deny-list specification gap closed by R2-F2 fix)

The two data gaps the R2 agent persisted are now closed by this pass and can be marked resolved in TODO.md by the Step 7b verification step. The three research gaps remain open and persist in REGISTRY.md as inputs to the blueprint cycle (per `lattice:research-cycle` Step 7b "gaps discovered during research are the INPUTS to blueprint-cycle prioritization").

---

## Status

**Research cycle:** complete and validated through R1+R2 peer review, corpus coherence audit, and probe (PROPAGATES verdict). The research artifact is final.

**Post-research planning:** subsequent conversation (2026-05-07) refined the architecture in two ways that **supersede portions of the formal deliverable** (no skills move out of harness — Pattern A only; platform pack contains real skills, not just data + templates). These refinements + the corrected decoupling plan are persisted in **`decoupling-handoff.md`** alongside the formal deliverable. **Read both docs to resume work cold.**

**Topic lock:** held at `C:/pg/pcc/.lattice/cycle-lock/dg-agentic-harness/` (acquired 2026-05-07 by `research-cycle`).

**State file:** `C:/pg/pcc/.lattice/cycle-state/dg-agentic-harness.yaml`. Algorithmic = false; oracle walk skipped per non-algorithmic topic; output_root = `C:/pg/lattice/research/dg-harness/`.

**Next steps:**
- Step 2: blind R1 peer review (fresh-context agent reads the deliverable cold)
- Step 3: incorporate R1 findings
- Step 4: blind R2 peer review (fresh-context, may use `--novel`)
- Step 5: evaluate
- Step 6: distill — coherence audit against the existing Lattice docs (`harness-for-datagrok.md`, `datagrok-harness-workplan.md`)
- Step 7: probe for cross-system implications across the harness/platform/project pillars
- Step 7b: persist any new gaps discovered to TODO.md, release the topic lock
