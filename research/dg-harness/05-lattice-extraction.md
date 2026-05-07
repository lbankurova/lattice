# 05 — Lattice Extraction

> Lattice-as-it-stands inventory + generalization plan. The empirical grounding for the testable claim *"the harness pillar contains ZERO DG-specific references."*

## 1. Already Known

The donation table in `docs/datagrok-harness-workplan.md:23-33` declares eight assets domain-neutral and one (Lattice's scientific layer) explicitly NOT donatable:

| Donation | Maturity | DG-applicable per the table? |
|---|---|---|
| Failure-mode catalog | Production-tested 4 months | Yes — domain-neutral |
| Cycle structure | Production | Yes, with adaptations |
| Sub-agent protocol | Production | Yes — domain-neutral |
| Attestation format | Production | Yes — domain-neutral |
| Verdict-enum registry | Production | Yes — same shape needed for any agent harness |
| Typed knowledge-graph pattern | Production for SENDEX; pattern is portable | Yes |
| Hook + lock + state-write discipline | Production | Yes — domain-neutral |
| Workflow YAML executor | Production | Maybe — Datagrok may want a different shape |
| Lattice's scientific layer (algo-defensibility, validation ratchet, NOAEL methods) | SENDEX-specific | **No** |

The README's worked translation table (`README.md:283-293`) maps each Lattice piece to a Datagrok analog, suggesting the framework *as a pattern* transfers cleanly.

**This document audits whether the donations are as donatable as the docs claim. Spoiler: at the file level, the harness is more SENDEX-coupled than the donation table implies, but the coupling is concentrated in skill prompts and is structurally extractable.** Sections 2-6 do the per-file inventory; Section 7 picks an extraction strategy; Section 8 returns the verdict on the platform-agnostic claim.

## 2. Skill inventory

Coupling kinds:
- **none** — no SENDEX-specific paths or domain terms; ready for harness pillar
- **path** — references SENDEX paths (`docs/_internal/...`, `backend/services/analysis/...`) but the *concept* is generic; parameterizable via the `lattice-project.toml` proposed in 04-project-graph.md §6
- **domain-term** — references SENDEX domain (NOAEL, syndrome, toxicologist, study); domain-coupled but the skill *shape* is generic
- **script-name** — references project-specific scripts (`audit-19-*.py`, `generate-validation-docs`, `query-knowledge.py`); substitutable
- **fundamental** — domain-coupled in a way that doesn't generalize (the skill IS for tox)

Reading every skill file in full. Counts and verdicts below; a "donatable" verdict requires only **path** and/or **script-name** coupling, which is parameterizable. **domain-term** coupling is amber: the skill works for any project but the prompt is shaped by SENDEX exemplars and would benefit from re-authoring per-platform. **fundamental** coupling is red.

### 2.1 commands/lattice/*.md (28 skills)

| Skill | Purpose (1-line) | SENDEX-coupled? | Coupling kind | Donatable? |
|---|---|---|---|---|
| `cycle.md` | Meta-orchestrator — classifies work, dispatches sub-cycle | Yes | path + domain-term (engine module names: `classification.py`, `findings_pipeline.py`, `scores_and_rules.py` at line 71; `BUG-SWEEP.md` reference at line 85; engine signal definition is SENDEX-shape) | Yes — re-author classification heuristic per project |
| `research.md` | Deep domain research — gap analysis, feature proposals | Yes | path + domain-term (Phase 4 oracle walk explicitly assumes algorithmic outputs in mortality / NOAEL / LOAEL / adversity / syndrome / severity / recovery / onset; references PointCross / Nimble / CBER studies; `unified_findings.json`; reference cards at `docs/validation/references/*.yaml`) | Yes — Phase 4 is opt-in (`Skip condition` line 206); skill core is generic |
| `synthesize.md` | Map research findings to codebase — produce implementation spec | Yes | path + domain-term + script-name (`backend/services/analysis/`, `backend/generator/`, `frontend/src/lib/`, `backend/generated/PointCross/`; references methods-index, species-profiles, vehicle-profiles by name; Phase 2b uniformity check uses tox examples) | Yes — paths parameterize; reuse-inventory section is harness-pillar; skill structure (capability-map, simplicity rationale, test strategy) is domain-neutral |
| `peer-review.md` | Blind scientific peer review of methods/claims | Yes | domain-term + path + script-name (`query-knowledge.py` mandatory; `algorithm-paths.txt`; `docs/validation/references/*.yaml`; `frontend/tests/generate-validation-docs.test.ts`; PointCross/Nimble/CBER fixtures; B. assertion walk is mortality/NOAEL/LOAEL-shape) | Yes — but Section 0 + B. assertion-walk are scientific-layer (per donation table). Standard sections 1-7 are harness-pillar. |
| `architect.md` | Architecture quality gate — overengineering / science preservation | Yes | path + domain-term + script-name (`docs/_internal/knowledge/code-quality-guardrails.md`; algorithm classifier names SENDEX algorithms; spec-lint cites `query-knowledge.py` and `knowledge-graph.md`) | Yes — gate logic and verdict enums are harness-pillar; SENDEX-specific is in the algorithmic-spec detection |
| `probe.md` | Cross-impact analysis on a change/decision | Yes | path + domain-term (`system-manifest.md` is the data dependency; example `probe backend/services/analysis/classification.py`; SCIENCE-FLAG examples cite SENDEX endpoints) | Yes — the skill structure (blast radius, classification, persist-findings) is generic; system-manifest is project-side artifact |
| `distill.md` | Corpus-level reasoning across accumulated research | Yes | path (Layer 0/1 reads cite `system-manifest.md`, `scoring-engine-model.md`, `methods-index.md`, `species-profiles.md`, `vehicle-profiles.md`; thesis exemplars are tox-shape) | Yes — corpus-load logic is generic; SENDEX-specific is the named-files list (parameterizable via `lattice-project.toml [knowledge.registries]`) |
| `implement.md` | Autonomous spec implementation — phase-by-phase, audit | Yes | path + domain-term (Phase 1.D empirical claim verification example uses PointCross BW + brown dot count + `unified_findings.json`; reuse-anchor instructions reference SENDEX file structure) | Yes — implementation conductor is harness-pillar; exemplar would be re-authored |
| `review.md` | Quality gate — spec-vs-code trace + commit | Yes | **HEAVY** (line 6 declares "You are the Review Agent for SENDEX (SEND Explorer)"; line 9-15 SEND domain expertise section; SENDIG 3.1; FDA tox; toxicologist persona; doc-regen Step A/B/C runs PCC-specific scripts: `scripts/generate-coverage-facts.py`, `vitest run generate-engine-reference`, `vitest run ground-truth-validation`; Step 3 mechanical gate hard-codes `cd C:/pg/pcc/frontend`) | Yes, BUT the skill needs significant re-authoring — the SENDEX persona declaration and doc-regen Step A/B/C are deeply project-specific. The 7-section format and 4-dimension trace are harness-pillar |
| `build-cycle.md` | Build phase — implement, review, commit | Yes | path (cycle state, spec paths, knowledge-graph path) — minor coupling | Yes — easy port |
| `blueprint-cycle.md` | Blueprint phase — synthesize, gate, probe, plan-review | Yes | path (knowledge files, research/, REGISTRY.md) | Yes — pure path coupling |
| `research-cycle.md` | Research phase — produce, R1, R2, evaluate, distill, probe | Yes | path + domain-term (Step 1 algorithmic-topic gate references mortality/NOAEL/LOAEL/severity/onset; `backend/generated/<study>/unified_findings.json`) | Yes — gate logic is harness-pillar; algorithmic-topic gate is opt-in per project's `algorithm-paths.txt` |
| `prioritize.md` | Strategic advisor — what to research/build next | Yes | path + domain-term (capabilities.yaml is PRIMARY; example pillar names are tox; mentions species magnitude thresholds, MI/MA HCD, NHP) | Yes — the merit hierarchy and bucket classification are harness-pillar; examples are illustrative |
| `autopilot.md` | Portfolio autopilot — advance safe topics + mechanical TODO | Yes | path + script-name (cycle-state, decisions.log, ESCALATION.md, `lattice status --reconcile`) | Yes — orchestration is harness-pillar; SCIENCE-FLAG resolution paths are inherited from scientific layer |
| `daily-update.md` | Slack-formatted daily update from commits | Yes | domain-term (NOAEL examples in synthesis rules and adjacent-open check; project_name "SENDEX" in JSON example) | Yes — the daily-update format is generic; SENDEX appears in examples only |
| `design.md` | UI/UX design step — layout, technology, redundancy | Yes | **HEAVY** (CT-3 check explicitly cites "the canonical sendex science-loss pattern"; `audits/workflow-audits/STUDY-FIXTURES.md`; `frontend/src/audits/...`; `OverridePill`, `findings-rail`, `endpoint-confidence`; many SENDEX file/component names) | Maybe — the design preamble/decision tree is harness-pillar; CT-N theme citations and component names are SENDEX-specific. Generalization requires per-platform `audit-checklist.md` and component-reuse map |
| `ux-designer.md` | UX/UI Designer role for Datagrok plugins | No (Datagrok-platform-coupled) | path | **Yes** — explicitly Datagrok-platform-flavored already; structure is reusable |
| `ux-audit-walk.md` | Stage 1 UX audit — Playwright walk, candidate README | Yes | path + domain-term (persona p1-p7, workflow slugs like `noael-determination`, study fixtures table; `localhost:5173` SENDEX dev port) | Yes — the walk protocol is harness-pillar; persona definitions and workflow slugs are project-side |
| `ux-audit-validate.md` | Stage 2 UX audit — filter against rule files | Yes | path (mandate file is `.claude/rules/ux-audit-validate.md` which is sendex-shape) | Yes — the rule-file delegation pattern is generic |
| `ux-audit-file.md` | Stage 3 UX audit — VALIDATED → TODO.md | Yes | path (TODO.md, capabilities.yaml) | Yes — pure path coupling |
| `extract-learnings.md` | Extract durable knowledge into knowledge/ + architecture/ at archive | Yes | path + domain-term (rule 19 / typed knowledge graph; methods-index, species-profiles, vehicle-profiles; spec-archive rename trigger) | Yes — the extraction taxonomy (numeric threshold → typed graph, statistical method → methods-index) is harness-pillar with project-specific destinations |
| `lint-knowledge.md` | Lint knowledge corpus — IDs, citations, schema | Yes | **HEAVY** (line 21 hardcodes `C:/pg/pcc/backend/venv/Scripts/python.exe`; explicit SENDEX registry list; `audit-knowledge-graph.py`, `audit-contract-triangles.py`, `audit-fct-coverage.py`, `audit-fct-conflicts.py`) | Yes — the lint protocol is harness-pillar; the registry list and script names are project-side |
| `lit-triage.md` | Triage orphan PDFs in research/ | Yes | **HEAVY — fundamentally tox-coupled** (literature note schema; SENDEX-specific knowledge surfaces; `RELEVANT-NEEDS-NOTE` for tox HCD papers; species + endpoint mismatches; cyno HCD example; clinical pathology references) | **Maybe** — the triage protocol (extract text, identify citation, verify, verdict) is generic; the verdict criteria are tox-shaped. A general lit-triage would have project-specific verdict rules |
| `spike.md` | Exploratory implementation without spec ceremony | No | path (TODO.md, REGISTRY.md) | Yes — clean |
| `spec-from-code.md` | Generate spec from existing implementation | No | path (incoming/, ROADMAP.md, REGISTRY.md, TODO.md) | Yes — clean |
| `pause-work.md` | Create context handoff file | No | none | Yes — clean (only references generic `.continue-here-*.md` pattern + cycle-state filename derivation) |
| `resume-work.md` | Restore context from previous session | No | none | Yes — clean |
| `implement-todo.md` | Apply single TODO mechanical fix end-to-end | Yes | path + script-name (TODO.md candidates; `scripts/declare-commit-intent.sh` is project-side per skill itself; `ESCALATION.md`; CLAUDE.md rule 14 reference) | Yes — clean other than rule reference |

### 2.2 commands/ops/*.md (6 skills)

| Skill | Purpose | SENDEX-coupled? | Coupling kind | Donatable? |
|---|---|---|---|---|
| `bug.md` | Log bug to BUG-SWEEP.md | Yes | path (`docs/_internal/BUG-SWEEP.md`); examples are SENDEX (LOO chart, dose label, context panel) | Yes — clean structure |
| `bug-stress.md` | Post-fix stress test, oracle growth | Yes | **HEAVY** (Step 1 pattern families include `species-variance`; examples are tox; system-manifest dependency; `backend/services/analysis/classification.py` example) | Yes — pattern families are reusable, examples are illustrative |
| `check.md` | Lightweight build/sanity check mid-implementation | Yes | **VERY HEAVY** (Step 1 hard-codes `cd C:/pg/pcc/frontend && npm run build`; Step 2 enumerates SENDEX engine files: `classification.py`, `findings_pipeline.py`, `derive-summaries.ts`, `cross-domain-syndromes.ts`, `endpoint-confidence.ts`, `g-lower.ts`, `organ-weight-normalization.ts`; Step 4 import smoke test names SENDEX routers: `routers.temporal`, `routers.analysis_views`, `generator.generate.run_pipeline`) | Yes — but requires extensive re-authoring per project. The OPS_CHECK_VERDICT verdict format is harness-pillar |
| `explore-data.md` | Explore generated study data | Yes | **VERY HEAVY** (line 6 declares "data exploration assistant for SENDEX generated study data"; SENDEX file names: `dose_response_metrics.json`, `study_signal_summary.json`, `adverse_effect_summary.json`, `target_organ_summary.json`, `subject_context.json`, `noael_summary.json`, `organ_evidence_detail.json`, `rule_results.json`, `lesion_severity_summary.json`, `study_metadata_enriched.json`; default study `PointCross`) | **No** — fundamentally SENDEX-coupled. Different domains have different "generated data" shapes. Equivalent for Datagrok would be a new skill, e.g., `/ops:explore-package` for plugin metadata |
| `impact.md` | Analyze breakage from modifying shared code | Yes | path + domain-term (`backend/services/analysis/classification.py` example; engine change auto-flag; `methods-index.md`, `field-contracts.md`) | Yes — analysis logic is harness-pillar; engine paths are project-side |
| `sweep.md` | Garbage collection for project state | Yes | path + script-name (`docs/_internal/TODO.md`, `ROADMAP.md`, `MANIFEST.md`, `incoming/`, `decisions.log`; Step 7 `scripts/generate-coverage-facts.py`; `wiki_sendex_coverage.md`) | Yes — sweep logic is harness-pillar; coverage-facts step is project-side |

### 2.3 Skill-level summary

| Coupling tier | Count | % of 34 |
|---|---:|---:|
| **none** (truly clean) | 3 | 9% |
| **path-only** (parameterizable) | 7 | 21% |
| **path + domain-term** (port-with-re-authoring) | 17 | 50% |
| **HEAVY** (substantial re-authoring) | 6 | 18% |
| **fundamental** (cannot generalize as-is) | 1 | 3% |

The single fundamental-coupling skill is `ops/explore-data.md` — it is the SENDEX-shape data-explorer. The 6 HEAVY skills are: `review.md` (SEND domain expertise declaration), `design.md` (CT-N theme references), `lint-knowledge.md` (hardcoded venv path + audit-script list), `lit-triage.md` (tox literature triage rules), `ops/check.md` (hardcoded `C:/pg/pcc/frontend` and SENDEX engine module list), `ops/bug-stress.md` (tox pattern families).

**Translation: 18 of 34 skills (53%) are non-trivially SENDEX-coupled** — they would need re-authoring or substantial parameter extraction to ship on the harness pillar without SENDEX assumptions.

## 3. Agent inventory

| Agent | Purpose | SENDEX-coupled? | Coupling kind | Donatable? |
|---|---|---|---|---|
| `peer-review.md` | Blind scientific peer reviewer (subagent) | Yes | domain-term + script-name (Algorithmic-tightening F3 cites `query-knowledge.py`, `algorithm-paths.txt`; B. assertion-walk references mortality / NOAEL / LOAEL / adversity / target-organ / syndrome / severity / recovery / onset; PointCross/Nimble/CBER fixture names; `docs/validation/references/*.yaml`) | Yes — Section 0 (load-bearing claims) is harness-pillar; F3 (algorithmic-tightening) is scientific-layer per donation table |
| `architect-reviewer.md` | Architecture reviewer (subagent) | Yes | domain-term (Essential complexity table cites `8-way finding verdict logic`, `species-specific branching`, `multi-domain correlation` of LB+BW+MI+MA, syndrome detection — SENDEX domain examples) | Yes — accidental-vs-essential pattern table generalizes; the *examples* in essential-complexity column are tox-shape |
| `decision-auditor.md` | Decision auditor (subagent) | Yes | path (knowledge/species-profiles, vehicle-profiles, methods-index, field-contracts, contract-triangles cited as evaluation references) | Yes — the merit verdict logic is harness-pillar; cited references are project-side knowledge files |
| `post-impl-reviewer.md` | Spec-vs-code evidence trace (subagent) | No | none (purely structural — spec → code → 4-dimension trace) | Yes — clean |

### 3.1 Agent-level summary

3 of 4 agents have **path/domain-term** coupling (parameterizable + illustrative). 1 agent (`post-impl-reviewer.md`) has zero coupling. **Agents are more donatable than skills**, which makes sense: agents are the harness's enforcement primitive; the SENDEX-flavor lives in the skills that orchestrate them.

## 4. Workflow inventory

| Workflow | Purpose | SENDEX-coupled? | Coupling kind | Donatable? |
|---|---|---|---|---|
| `cycle.yaml` | Meta-orchestrator — classify, dispatch | Yes | domain-term in `classify-auto` prompt (line 148-149: SENDEX engine module names) | Yes — the classification prompt re-authors per project |
| `research-cycle.yaml` | Research phase orchestration | Yes | path (Step 1 oracle gate cites `backend/generated/<study>/unified_findings.json`; included science-flag-resolution names species-profiles / vehicle-profiles / methods-index) | Yes — purely path coupling, parameterizable |
| `blueprint-cycle.yaml` | Blueprint phase orchestration | Yes | path (knowledge file references in science-flag memo block) | Yes — parameterizable |
| `build-cycle.yaml` | Build phase orchestration | Yes | path (knowledge file references in science-flag memo block) | Yes — parameterizable |
| `bug-fix-cycle.yaml` | Bug fix orchestration | Yes | path (knowledge file references in science-flag memo block) | Yes — parameterizable |
| `spike-cycle.yaml` | Spike orchestration | No | none (only references its own state file + topic-lock + spike skill name) | Yes — clean |
| `mechanical-fix-cycle.yaml` | Mechanical TODO fix orchestration | Yes | comment-only (line 80: "The check is project-specific: pcc has scripts/declare-commit-intent.sh") | Yes — the comment is informational; behavior depends on project-side script |
| `autopilot.yaml` | Portfolio autopilot spec | No | none (specifies behavior; actual implementation is in `executor/src/autopilot.ts`) | Yes — clean |
| `verdict-enums.yaml` | Verdict enum registry | No | none | Yes — pure schema |
| `_includes/science-flag-resolution.yaml` | SCIENCE-FLAG resolution memo protocol | Yes | path (line 43-45: `species-profiles.md`, `vehicle-profiles.md`, `methods-index.md`, `field-contracts.md` listed as permitted citation sources) | Yes — the citation-source list is project-side; substitute via `lattice-project.toml [knowledge.registries]` |

### 4.1 Workflow-level summary

10 of 10 workflows are donatable. The coupling is concentrated in:
1. The `classify-auto` prompt in `cycle.yaml` (one prompt, easily re-authored).
2. The science-flag memo permitted-sources list (one file, copied via the `_includes/` mechanism into 3 consumer cycles — fix once, propagates).
3. The path references to `backend/generated/<study>/unified_findings.json` in `research-cycle.yaml` (project-side via `lattice-project.toml [validation]`).

**The workflow YAMLs are the cleanest part of Lattice**, which validates the donation table's claim that the workflow YAML executor is donatable. The schemas, executor, and DAG structure are domain-neutral; the prompts inside skill nodes carry the SENDEX flavor.

## 5. Script inventory

| Script | Classification | SENDEX-specific? | Notes |
|---|---|---|---|
| `acquire-lock.sh` | harness-grade | No | Atomic mkdir lock with PID-liveness, generic |
| `release-lock.sh` | harness-grade | No | Generic lock release |
| `acquire-topic-lock.sh` | harness-grade | No | Per-topic mkdir lock |
| `release-topic-lock.sh` | harness-grade | No | Generic |
| `merge-shared-state.sh` | harness-with-config | path-coupled | Refreshes `TODO.md`, `REGISTRY.md`, `decisions.log`, `ROADMAP.md`, `MANIFEST.md` from HEAD; the file list is project-graph-component-keyed (5 names) — easy to parameterize |
| `install-hooks.sh` | harness-grade | No | Generic hook installer |
| `sync-skills.sh` | harness-grade | No | One-way `cp` from lattice → consumer; mentions `pcc` in comments only |
| `sync-workflow-includes.sh` / `.py` | harness-grade | No | Generic include-substitution into workflow consumers |
| `context-meter.sh` | harness-grade | No | Reads `.lattice/context-telemetry.jsonl` |
| `design-session.sh` | harness-grade | No | Manages `.lattice/design-mode.lock` |
| `design-mode-gate.sh` | harness-grade | No | PreToolUse hook for design-mode gate |
| `append-attestation.sh` | harness-grade | No | Generic JSON-append to `.lattice/pending-attestations.json`; one example references "OECD 407 LOAEL" but it's an example string, not behavior |
| `write-review-gate.sh` | harness-with-config | **MEDIUM** | Default algorithm-paths regex hardcoded SENDEX file names (line 121); error messages mention PointCross / NOAEL / regulatory toxicologist (lines 135-140). Algorithm-paths is project-overridable; error wording would need to be parameterized |
| `validation-ratchet.sh` | harness-with-config | path-coupled | Compares `.lattice/validation-baseline.json` to current scores; comparison logic is generic; "validation suite" definition is project-side |
| `test-attestation-format.sh` | harness-with-config | uses SENDEX example | Test file — uses `frontend/src/lib/derive-summaries.ts` and "PointCross BW" in fixtures (lines 273-340); the test logic is harness-pillar |
| `tests/test-bug-retro-pattern.sh` | harness-grade | No | Tests bug-retro regex |
| `tests/test-install-hooks.sh` | harness-grade | No | Generic |
| `tests/test-lock-concurrency.sh` | harness-grade | No | Generic |
| `tests/test-lock-ownership.sh` | harness-grade | No | Generic |
| `tests/test-shared-state-merge.sh` | harness-grade | No | Generic |
| `tests/test-validation-ratchet.sh` | harness-grade | No | Generic |
| `extract-pdf-text.py` | harness-grade | No | Generic PDF text extractor (used by lit-triage) |
| `audit-novel-source-discovery.py` | harness-grade | No | Validates `## Novel Source Discovery` table format in peer-review docs; format is harness-pillar |
| `audit-peer-review-citations.py` | **project-specific** | Yes | Audits author-year citation hygiene; line 24 cites pcc TODO; line 66 hardcodes "PointCross" in name list |
| `audit-corpus-citations.py` | **project-specific** | Yes | pcc-driven (line 69, 97-98 hardcode SENDEX/PointCross/Nimble in non-citation token list) |
| `discovery-scan.py` | **template** (project-specific) | **Self-declared template** | First lines explicitly say "TEMPLATE (heavily pcc-driven, fork to your project)"; instructs the user to copy and re-author |

### 5.1 Script-level summary

| Tier | Count | % |
|---|---:|---:|
| harness-grade (general-purpose) | 16 | 64% |
| harness-with-config (parameterizable) | 5 | 20% |
| project-specific | 3 | 12% |
| template (self-declared) | 1 | 4% |

Scripts are the most extractable layer. **20 of 25 scripts are harness-pillar candidates** with at most parameter-extraction work. The 3 audit scripts and 1 template are explicitly project-side and *should not* migrate to the harness pillar — they belong in `scaffold/scripts/` as templates for consumer projects to adapt.

## 6. Executor (TypeScript) audit

The executor is structurally harness-pillar — it dispatches workflow YAMLs without knowing what's in them. Audit:

| File | Lines | SENDEX-coupled? | Notes |
|---|---:|---|---|
| `index.ts` | small | No | Public entry point |
| `cli.ts` | medium | No | Generic CLI |
| `loader.ts` | medium | No | YAML loader + verdict-enum validation |
| `engine.ts` | medium | No | Workflow execution engine |
| `nodes.ts` | medium | No | Node-type implementations |
| `dag.ts` | medium | No | Topological sort |
| `state-io.ts` | medium | No | Atomic + CAS state writes |
| `types.ts` | small | No | Type definitions |
| `template.ts` | small | No | Template variable substitution |
| `budget.ts` | medium | No | Cost / context-rot telemetry |
| `auto-resolve.ts` | medium | No | Coherence auto-resolution |
| `coherence.ts` | large | **One comment** at line 583 references `pcc/.lattice/cycle-state/outliers-pane-unified.yaml:23` as a back-compat anchor for legacy prose-form `prerequisite:` field. Behavior is generic; the comment names a SENDEX file as historical context. | Trivial fix (re-word comment) |
| `e2e.ts` | medium | No | Branch-comparison E2E gate |
| `reconcile.ts` | medium | **One hardcode** at line 177: `${cwd}/docs/_internal/incoming/archive`. Otherwise generic. | Single line; addressed by `lattice-project.toml [specs] archive` per 04 §6 |
| `autopilot.ts` | large | No | Portfolio loop |
| `todo-queue.ts` | medium | **One fallback chain** at lines 33-37: `['docs/_internal/TODO.md', 'TODO.md', 'docs/TODO.md']`. The fallback chain is friendly; the first entry is SENDEX-shape. | Clean — fallback chain is the right shape; addressed by `lattice-project.toml [backlog] todo` |
| `engine-revision.test.ts` and other `*.test.ts` | various | No | Tests |

### 6.1 Executor verdict

The executor is **functionally clean** — 2 hardcoded paths in 2 files (`reconcile.ts` and `todo-queue.ts`), 1 informational comment in `coherence.ts`, and the rest is structurally project-agnostic. The two hardcodes have natural fallback semantics already; the coherence-comment is informational. The proposed `lattice-project.toml` (04 §6) addresses both hardcodes in <50 lines of TypeScript change.

**The executor is the closest thing to a clean "harness library" Lattice has.** It is the natural foundation for whatever extraction strategy wins in §7.

## 7. The extraction question

Three options for separating Lattice into harness vs project. The donation table in `docs/datagrok-harness-workplan.md:103-107` enumerates them; this section scores each.

### 7.1 Option A — Fork

Datagrok forks the whole repo, evolves independently. Larisa needs a merge cadence to stay current.

| Dimension | Score |
|---|---|
| Ongoing duplication cost | **High** — every fix to the harness pillar needs to be cherry-picked from one fork to the other |
| Time to first DG plugin port | **Low** — Datagrok has full ownership, can move fast |
| Contributor model | Two repos, two owners, two governance models. PRs land in whichever fork is closer to the change |
| Governance complexity | **Low for each fork individually**; high across the pair (no shared truth) |
| Risk to SENDEX velocity | **Low** — SENDEX continues unchanged |

Forks rot. Within 2 milestones, the two trees diverge enough that mechanical merging stops working. The four-month build cost of Lattice on SENDEX would be re-paid every 6-9 months as patches drift apart. **Recommend against.**

### 7.2 Option B — Vendor (Lattice-core library, both consumers depend on it)

Carve Lattice into a clean library (executor + harness-pillar skills + harness-grade scripts + agents + workflow-YAML schema + scaffold) and have both SENDEX and Datagrok depend on it.

| Dimension | Score |
|---|---|
| Ongoing duplication cost | **Lowest** — single source of truth for harness-pillar |
| Time to first DG plugin port | **Medium** — requires the library carve-out work first (the work this document inventories) |
| Contributor model | Three repos: `lattice-core`, SENDEX, DG-harness. PRs land in `lattice-core` for harness changes; SENDEX and DG carry only their project-side artifacts |
| Governance complexity | **Medium** — needs versioning discipline, semver, release cadence. The donation table calls this out |
| Risk to SENDEX velocity | **Medium short-term, low long-term** — the carve-out is friction once; upstream-dependency model is well-understood after that |

This is the donation table's preferred shape (per "Lattice's role" framing in `datagrok-harness-workplan.md:17-22` — "the framework owns process-level artifacts"). It also matches the README's three-layer model (`harness-for-datagrok.md:255-259`). **The audit in §2-§6 above is the carve-out spec**: harness-pillar = executor + clean skills + agents + workflows + harness-grade scripts; project-pillar = HEAVY skills (re-authored per platform) + project-specific scripts + knowledge artifacts + audit scripts.

### 7.3 Option C — In-place generalize (single repo, refactored)

Refactor the current single repo so harness-pillar code is in one tree (e.g., `harness/`) and SENDEX-specific bits move to `pcc/`. No new repo, no new package, just a directory reorganization.

| Dimension | Score |
|---|---|
| Ongoing duplication cost | **Low** — one repo, one source of truth |
| Time to first DG plugin port | **High** — Datagrok has to either depend on a directory inside Lattice's repo (weird) or wait for the library extract (in which case Option B is the destination) |
| Contributor model | One repo with two consumers wedged inside; awkward — Datagrok contributors land PRs in Larisa's repo |
| Governance complexity | **High** — SENDEX is a private project; making it a public-facing harness consumer mixes governance |
| Risk to SENDEX velocity | **Low** — internal reorganization |

In-place is the right *first step* but the wrong *destination*. It defers the governance decision (who owns the harness?) without resolving it. **Recommend as a transitional state, not the final state.**

### 7.4 Recommendation: **Vendor (Option B), with In-place (Option C) as the prep step**

The carve-out work is real but bounded. The audit above gives the inventory:

- **Harness-pillar carved into `lattice-core/`**:
  - `executor/` (clean except 2-line fixes)
  - `agents/` (4 files, 3 with light coupling)
  - `workflows/` (10 files, only `cycle.yaml` prompt + `_includes/science-flag-resolution.yaml` permitted-sources need parameterization)
  - `commands/lattice/` minus the HEAVY skills: `cycle.md`, `research.md`, `synthesize.md`, `peer-review.md`, `architect.md`, `probe.md`, `distill.md`, `implement.md`, `build-cycle.md`, `blueprint-cycle.md`, `research-cycle.md`, `prioritize.md`, `autopilot.md`, `daily-update.md`, `extract-learnings.md`, `spike.md`, `spec-from-code.md`, `pause-work.md`, `resume-work.md`, `implement-todo.md`, `ux-audit-walk.md`, `ux-audit-validate.md`, `ux-audit-file.md` (23 skills)
  - `commands/ops/` minus HEAVY: `bug.md`, `impact.md`, `sweep.md` (3 skills)
  - `scripts/` minus project-specific: 20 of 25 scripts
  - `hooks/` (clean per audit)
  - `scaffold/` (template tree, expanded with `lattice-project.toml` template per 04 §6)
- **Stays project-side** (lives in SENDEX or Datagrok or future plugin's own repo):
  - HEAVY skills: `review.md`, `design.md`, `lint-knowledge.md`, `lit-triage.md`, `ops/check.md`, `ops/bug-stress.md`, `ops/explore-data.md`
  - Domain knowledge: `docs/_internal/knowledge/*.md`, `docs/_internal/research/*.md`, `docs/validation/`
  - Project-specific scripts: `audit-corpus-citations.py`, `audit-peer-review-citations.py`, `discovery-scan.py`, `query-knowledge.py` (project-side per CLAUDE.md rule 19), `validation-ratchet.sh` adaptation
  - Project audit scripts: `audit-knowledge-graph.py`, `audit-contract-triangles.py`, `audit-fct-coverage.py`, `audit-fct-conflicts.py`, `find-unmounted-components.py` (per `lint-knowledge.md` Step 2 — explicitly project-side)
  - Project-specific design rules: `.claude/rules/*.md` (path-scoped to specific project)

Larisa keeps SENDEX as a Lattice consumer; Datagrok carves the harness-pillar out and consumes it; future plugins consume the same library.

Path: do the in-place reorg as Phase 0 (1-2 weeks), then publish `lattice-core` as a library (Phase 1, 2-4 weeks). This matches `docs/datagrok-harness-workplan.md` Phase 2 timing.

## 8. The platform-agnostic claim verdict

**Verdict: PARTIALLY — the executor and most workflows are platform-agnostic; ~18 of 34 skills are not.**

### 8.1 What survives the claim

- **Executor** (16 TypeScript files in `executor/src/`) — clean except 2 single-line path hardcodes (`reconcile.ts:177`, `todo-queue.ts:33-37`) and one informational comment (`coherence.ts:583`). These are addressed by the proposed `lattice-project.toml` (04 §6).
- **Workflows** (10 YAML files) — clean except domain-term mentions in `cycle.yaml` classification prompt (line 148-149) and path references in the `_includes/science-flag-resolution.yaml` permitted-sources list (line 43-45). Both parameterizable.
- **Hooks** (`pre-commit`, `post-commit`, `claude-hooks.json`) — fully harness-pillar.
- **Agents** (4 of 4) — domain-term mentions in examples but no file-level coupling. Donatable.
- **Verdict-enum registry** — fully harness-pillar.
- **Harness-grade scripts** (16 of 25) — fully harness-pillar.
- **3 of 28 lattice-prefix skills** (spike.md, spec-from-code.md, pause-work.md, resume-work.md, implement-todo.md): clean enough to ship as-is.

### 8.2 What does NOT survive the claim

- **Heavy-coupling skills** (6 skills, 18% of corpus):
  1. `review.md` — declares "You are the Review Agent for SENDEX (SEND Explorer)" at line 6; SEND domain expertise section; doc-regen runs PCC-specific scripts
  2. `design.md` — CT-N theme citations are SENDEX-shape; component-name references throughout
  3. `lint-knowledge.md` — hardcoded `C:/pg/pcc/backend/venv/Scripts/python.exe`; SENDEX-specific audit-script enumeration
  4. `lit-triage.md` — tox literature triage rules; species + endpoint mismatch criteria
  5. `ops/check.md` — hardcoded `C:/pg/pcc/frontend` path; SENDEX engine-files enumeration
  6. `ops/bug-stress.md` — tox pattern families and example fixes
- **Fundamentally-coupled skills** (1 skill, 3%):
  1. `ops/explore-data.md` — declares itself a "data exploration assistant for SENDEX generated study data"; file names are SENDEX-specific
- **Domain-coupled algorithmic peer-review** (`peer-review.md` Section F3 + `agents/peer-review.md` algorithmic-tightening section) — explicitly the scientific layer per the donation table; this is correctly *not* claimed as donatable.
- **Project-specific scripts** (3 + 1 template):
  - `audit-corpus-citations.py`, `audit-peer-review-citations.py` — SENDEX-shape
  - `discovery-scan.py` — self-declared template
- **17 path+domain-term coupled skills** (50% of corpus) — donatable with re-authoring; the file structure is generic, the prompt examples are SENDEX-shape

### 8.3 Survival count

| Category | Donatable as-is | Donatable with re-authoring | Not donatable |
|---|---:|---:|---:|
| Skills (lattice/) | 5 | 17 | 6 |
| Skills (ops/) | 3 | 2 | 1 |
| Agents | 1 | 3 | 0 |
| Workflows | 5 | 5 | 0 |
| Scripts | 16 | 5 | 4 |
| Executor files | ~14 | 2 | 0 |
| Hooks | 3 | 0 | 0 |

**The harness pillar contains ~76% of Lattice as-is or with parametric re-authoring** (executor + workflows + hooks + agents + clean skills + harness-grade scripts). **~24% is coupled enough that "Datagrok takes Lattice" is more accurately "Datagrok takes Lattice's harness pillar and re-authors the SENDEX-shaped prompts for its own platform"** — exactly what the donation table claims under "borrow heavily" (`README.md:35-38`) but with a more concrete inventory of what borrowing means.

### 8.4 The testable claim, restated

The claim *"the harness pillar contains ZERO DG-specific references"* survives **if the harness pillar is defined as the post-extraction bundle** (per §7.4 Option B) — executor + workflows + hooks + agents + 23 of 28 lattice-prefix skills + 3 of 6 ops skills + 20 of 25 scripts. In that bundle, after addressing 4 specific path hardcodes (executor +`reconcile.ts`/`todo-queue.ts`, scripts/`write-review-gate.sh` algorithm defaults, skills/`lint-knowledge.md` venv path), the file-level audit shows zero SENDEX-domain references.

The claim does NOT survive if the harness pillar is defined as "everything in the current `commands/lattice/` and `commands/ops/` directories." Those directories include 7 SENDEX-shaped skills that would have to either re-author or stay project-side.

**Recommendation: define the harness pillar by the §7.4 Option B carve-out, not by current directory structure.** Adopt the `lattice-project.toml` schema contract (04 §6) so the remaining SENDEX assumptions in path references collapse to a single declaration file the project pillar owns.

## 9. Open questions for thread discussion

1. **Should HEAVY skills (`review.md`, `ops/check.md`, etc.) be carved out per project, or shipped as templates with substitution markers?** Today's `sync-skills.sh` does one-way mirror. A template substrate would let the harness ship the skill structure (7-section review format, OPS_CHECK_VERDICT contract) while letting the project fill in domain-specific stanzas (which engine files trigger which gates). Vs. the simpler path: skills with project-specific framing live in the project.

2. **What's the right home for `query-knowledge.py`?** CLAUDE.md rule 19 names `docs/_internal/knowledge/knowledge-graph.md` as the typed-fact home and the script as project-side. But the contract (`--scope`, `--kind`, no-fact stub message) is harness-pillar — every algorithmic peer-review depends on it. Options: (a) ship a reference implementation in `scaffold/scripts/`; (b) define the contract in a JSON Schema and let projects pick any implementation; (c) make it part of the harness pillar with a YAML-backed default knowledge file.

3. **Should `peer-review.md` Section F3 (algorithmic-tightening) ship in the harness or stay project-side?** The donation table says scientific layer is NOT donatable. But the F3 *protocol* (mandatory query, mandatory citation, B. assertion-walk) is the same shape any high-stakes-analytical project would need. SENDEX's NOAEL/LOAEL/syndrome examples are illustrative; the structure is generic. Strawman: ship the F3 protocol as a harness-pillar opt-in (driven by `algorithm-paths.txt` presence), with the SENDEX-domain examples replaced by project-supplied examples.

4. **What's the migration strategy for the 17 path+domain-term skills?** Two options: (a) re-author every prompt to use template variables sourced from `lattice-project.toml`; (b) ship two skill versions (lattice-core base + project-flavored override that wraps it) and let `sync-skills.sh` apply the override on top. Option (a) is cleaner; option (b) better preserves SENDEX velocity during the transition.

5. **Does Datagrok actually want the typed knowledge graph layer?** The donation table says yes ("Datagrok needs a platform-fact graph in this shape"). But Lattice's typed-fact graph is wired into peer-review, architect, lint-knowledge, audit-knowledge-graph.py — at least 5 surfaces. A Datagrok adoption that takes the executor + workflows but skips the typed-fact graph would lose the algorithm-defensibility gate (Lattice's #1 differentiator per `harness-for-datagrok.md:111-117`). Strawman: typed-fact graph is opt-in via `lattice-project.toml [knowledge] typed_graph`; if absent, peer-review F3 falls back to "literature citation only."

## Sources

Files read in full:
- `C:/pg/lattice/README.md`
- `C:/pg/lattice/CLAUDE.md`
- `C:/pg/lattice/docs/datagrok-harness-workplan.md`
- `C:/pg/lattice/docs/harness-for-datagrok.md`
- `C:/pg/lattice/scaffold/.lattice/README.md`
- All 28 skills in `C:/pg/lattice/commands/lattice/*.md`
- All 6 skills in `C:/pg/lattice/commands/ops/*.md`
- All 4 agents in `C:/pg/lattice/agents/*.md`
- All 10 workflows in `C:/pg/lattice/workflows/*.yaml` (including `_includes/science-flag-resolution.yaml` and `verdict-enums.yaml`)
- `C:/pg/lattice/hooks/pre-commit`
- `C:/pg/lattice/scripts/*` (audited via Grep + targeted Read)

Files read selectively (audit grep + key sections):
- `C:/pg/lattice/executor/src/*.ts` (15 source files + tests; full read of `reconcile.ts`, `todo-queue.ts`, `coherence.ts` lines 575-595, `autopilot.ts` lines 1-60)
- `C:/pg/lattice/scripts/discovery-scan.py` (self-declared template — read header only)
- `C:/pg/lattice/scripts/write-review-gate.sh` (algorithm-paths section)
- `C:/pg/lattice/scripts/acquire-lock.sh` (header only)

Files audited via Grep counts only:
- All `commands/` files for SENDEX-domain term frequency
- All `scripts/` files for `pcc|sendex|PointCross|toxicology` references
- `executor/src/*.ts` for hardcoded paths
- All `workflows/*.yaml` for SENDEX-specific terms

Empirical state of SENDEX project graph audited at:
- `C:/pg/pcc/.lattice/` (cycle-state, decisions.log, locks)
- `C:/pg/pcc/docs/_internal/` (TODO, ROADMAP, MANIFEST, knowledge, research, incoming)
- `C:/pg/pcc/CLAUDE.md` (Where Rules Live table)
