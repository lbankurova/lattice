# 08 — Architecture Recommendation

> **Single-page synthesis.** Defends or refutes the testable claim, names the harness/platform interface contract, sequences the work.

---

## 1. The testable claim, restated

> **The harness pillar contains zero DG-specific references. Swap the Platform pillar (DG → Tableau, Spotfire, no-platform-at-all) and the Harness shape stays constant. Add a new Project pillar (plugin #2, #3, ...) and the Harness shape stays constant.**

The user's framing in the SVG kickoff. The whole research deliverable is built to either defend or refute it.

**Pillar cardinality** (load-bearing distinction): **Harness** is *one* artifact, shared across every project everywhere. **Platform** is *one per platform* — DG's platform team authors a single `lattice-platform.toml` + `commands/datagrok/` skill pack consumed by every DG plugin. **Project** is *N* — one per plugin (`lattice-project.toml` + domain knowledge + re-authored HEAVY skills per plugin). SENDEX is plugin #1.

---

## 2. Verdict

**PARTIALLY survives — defines the harness pillar by carve-out, not by current directory structure.**

| Layer | Survives the claim? | Evidence |
|---|---|---|
| Executor (`executor/src/*.ts`, ~16 files) | **YES** — 2 single-line path hardcodes (`reconcile.ts:177` archive path, `todo-queue.ts:33-37` TODO fallback chain) plus 1 informational comment (`coherence.ts:583`). All three fixes are single-line. | 05 §6 |
| Workflows (10 YAML files) | **YES** — coupling is one classification prompt (`cycle.yaml:148-149`) + one permitted-sources list in the science-flag include. Both parameterizable. | 05 §4 |
| Hooks (`pre-commit`, `post-commit`, `claude-hooks.json`) | **YES** — fully harness-pillar. | 05 §6 |
| Agents (4 files) | **YES** — domain-term mentions in *examples* but no file-level coupling. | 05 §3 |
| Verdict-enum registry (`workflows/verdict-enums.yaml`) | **YES** — pure schema, harness-pillar by construction. | 05 §4.1 |
| Skills (34 files) | **PARTIALLY** — 16 truly clean or path-coupled (donatable as-is or with the schema contract); 17 path+domain-term (donatable with re-authoring); **6 HEAVY** (`review`, `design`, `lint-knowledge`, `lit-triage`, `ops/check`, `ops/bug-stress`); **1 fundamental** (`ops/explore-data`). | 05 §2.3 |
| Scripts (25 files) | **PARTIALLY** — 16 harness-grade, 5 parameterizable, 3 project-specific, 1 self-declared template. | 05 §5.1 |

**Headline arithmetic.** Today's Lattice (current state): 18 of 34 skills (53%) are non-trivially SENDEX-coupled (`05-lattice-extraction.md` §2.3). The **projected** post-carve-out harness-pillar bundle ships at ~76% of Lattice by file count — but that figure is computed *over the carve-out definition itself*, which excludes 6 HEAVY + 1 fundamental skill that stay project-side. The remaining 24% concentrates in those 7 skills, plus 17 skills whose *structure* is generic but whose *worked examples* are SENDEX-shape (NOAEL determination, syndrome detection, `unified_findings.json`). Per F-1 in the R1 peer review, the 76% should be read as "the proposed carve-out bundle is ~76% of Lattice by file count," not "76% of Lattice ships unchanged today."

**The 7 HEAVY/fundamental skills are SENDEX's daily-driver tools** — `review.md` (primary quality gate), `design.md` (UI design driver), `lint-knowledge.md` (knowledge maintenance), `lit-triage.md` (literature curation), `ops/check.md` (mid-build sanity check), `ops/bug-stress.md` (post-fix stress test), `ops/explore-data.md` (data exploration). Excluding them from the harness pillar means each plugin re-authors its own copies before running a complete cycle (one set per plugin, in the Project pillar — not one set per platform). Practical reading: the carve-out is "executor + workflows + agents + scripts + ~22 lighter skills"; the daily-driver layer is per-plugin.

The claim does **not** survive if the harness pillar is defined as "the current `commands/lattice/` and `commands/ops/` directories." It does survive if defined as "the post-extraction bundle" — Option B in §5 below.

The claim survives **at the specific implementation pattern level** in the comparable-frameworks scan, not as categorical absence of mitigation (per F-4 in the R1 peer review). Across 8 systems (Aider, Cline, Continue, SWE-agent, OpenHands, Smol-developer, Cursor, mini-swe-agent), no system implements the *specific pattern* of (a) commit-trailer reconciler + four-layer authoritativeness ladder, (b) two-round peer review with bikeshed + persistent-FLAWED arbiters, (c) verdict-enum registry validated at workflow-load, (d) algorithm-defensibility gate, or (e) full file-level concurrency hygiene as a composition. Equivalent mitigations for several of these failure modes exist via different mechanisms:

- **Verdict-enum registry** ↔ SWE-agent's action parser validates action shapes before dispatch (same class of error, different mechanism; see `03` Group 1 SWE-agent row).
- **Two-round peer review with arbiter** ↔ OpenHands' Nov 2025 inference-time scaling with trained critic model achieves "independently reviewed artifact" without the bikeshed-arbiter pattern (`03` Group 1 OpenHands row).
- **Concurrency hygiene** ↔ per-container isolation in SWE-agent and OpenHands enforces "no two sessions corrupt the same state" via architectural boundary rather than file-based locks.

The novelty claim is therefore: **Lattice is a unique composition of harness primitives, several with field precedent (markdown-as-system-prompt-fragment, mode separation, git-as-truth) and several with equivalent-but-different mitigations elsewhere; no system surveyed implements this specific composition** (`03` cross-cutting observations §2-§3).

---

## 3. Recommended harness/platform interface contract

The original kickoff posed three options for how DG-specific skills attach to the harness:

| Option | Description | Verdict |
|---|---|---|
| (a) Platform-adapter manifest | Harness consumes a `platform.yaml` the platform pillar provides | **Foundation, not whole answer** |
| (b) Sibling skill pack | DG skills are a separate pack the harness discovers via convention | **Right shape for skills** |
| (c) Hybrid | Harness extension points + platform pack registers against them | **Right shape for hooks/checks** |

**Recommendation: hybrid (c) layered on top of (a).**

Two contracts, separable:

### 3a. `lattice-project.toml` — the project-pillar schema contract

A single file at the project root declaring where each project-graph component lives — backlog, decisions log, cycle state, knowledge corpus, specs, design rules, validation references, runtime commands. Full sketch at 04 §6. The contract collapses 8 categories of coupling defects (04 §5.3) into a single audit surface.

This contract is **not platform-specific** — every project pillar declares it. SENDEX's TOML names `docs/_internal/knowledge/species-profiles.md`; a Datagrok plugin's TOML names `dev-harness/component-map.md` (or whatever the DG team authors per W1.A1 in the workplan). The harness reads the TOML and substitutes into skill prompts via template variables (`{{lattice.knowledge.system_manifest}}`).

### 3b. `lattice-platform.toml` (proposed) — the platform-pillar adapter

A second file at the **platform** root declaring DG-specific extension points:

```toml
# lattice-platform.toml — platform pillar registers against harness extension points

[platform]
name = "datagrok"
api_index = "dev-harness/api-index.json"     # the dg-api-index.json from 01 §5.4
component_map = "dev-harness/component-map.md"  # W1.A1 from workplan

[scaffold]
template_root = "tools/package-template"
create_command = "grok create"
entity_templates = "tools/entity-template"

[build]
validator = "grok check"              # the 9-check pipeline from 01 §3
validator_json_output = false          # 01 surprise: grok check has no structured output
direct_function_invocation = ["extractExternals", "checkImportStatements", "checkDatagrokApiImports", "checkHeavyImports", "checkFuncSignatures", "checkPackageFile", "checkChangelog", "checkSourceMap", "checkNpmIgnore"]  # workaround per 01 §3.4
api_regen = "grok api"                # webpack FuncGeneratorPlugin emits package.g.ts

[publish]
command = "grok publish"
release_flag = "--release"
package_server_validates = ["signature", "metadata-roles", "semver"]

[contract_triangles]
# Existing platform-side contract triangles per README.md DG translation table
function_metadata = { declaration = "JSDoc //name: //input: //output:", enforcement = "grok check tools/bin/commands/check.ts:67-131", consumption = "package.g.ts via FuncGeneratorPlugin" }
decorator_metadata = { declaration = "@grok.decorators.* (decorators/functions.ts)", enforcement = "build-time emit to package.g.ts", consumption = "FuncGeneratorPlugin" }
# Authored over time as the platform-fact graph grows (W1.A2)

[fact_graph]
root = "dev-harness/platform-facts.md"  # W1.A2 from workplan
schema = "scaffold/typed-fact-schema.yaml"  # uses the same typed schema as project pillar

[hooks]
pre_commit = ["grok check --strict", "audit-contract-triangles"]  # platform extends what runs at commit
pre_publish = ["grok check --strict", "validate-changelog", "audit-package-roles"]
```

The platform manifest is read by the harness at session start (alongside `lattice-project.toml`); skills that need platform-specific behavior reference it via `{{platform.scaffold.create_command}}` etc.

**Why this layering matters.** The project pillar contains *what this project knows* (knowledge files, validation references, design rules, runtime commands). The platform pillar contains *what this class of plugins shares* (component map, API index, build validator, contract triangles). Without separation, the platform-specific knowledge ends up duplicated across every plugin's `lattice-project.toml` — and rots at different rates per plugin. With separation, the platform team owns the platform manifest authoritatively; plugins consume it.

### 3c. Sibling skill pack — the DG-flavored skill bundle

A separate `commands/datagrok/*.md` (or distinct repo `lattice-datagrok/`) ships skills that are *intrinsically DG-shaped* and cannot be parameterized. From 02 §4, the canonical set:

- `add-viewer.md` — generates a `JsViewer` extension class with the platform-required constructor pattern
- `add-function.md` — appends a function with `//name: //input: //output:` JSDoc + decorator alternative
- `wire-detector.md` — adds a `<Name>PackageDetectors` method per the platform's required filename
- `add-script.md` — adds a Python/R/JS script with the platform's annotation grammar
- `prepare-release.md` — runs `grok api && grok check --strict && webpack && grok publish --release`

These are NOT platform-agnostic and shouldn't pretend to be. They live in their own pack, discovered by the harness via convention (a `lattice-pack` field in the platform manifest names the path), but they are not part of the harness pillar.

The platform-agnostic claim is preserved: the **harness pillar** does not contain `add-viewer.md`. The **platform pillar** ships it as part of the DG plugin pack. A non-DG project pulls a different pack (or none).

---

## 4. Where today's Lattice already ships against this contract

Per 05 §6, the executor is functionally clean. Per 05 §2.3, ~5 skills are donatable as-is and ~17 with re-authoring. Per 05 §4.1, all 10 workflows are donatable. Per 05 §5.1, 20 of 25 scripts are harness-grade or parameterizable.

The work to fully ship against the contract, **decomposed by owner and dependency** (per F-7 in the R1 peer review — the original framing conflated harness-side work with platform-pillar authoring; this section names the owners and the ordering, deliberately without time numbers — those are out of scope for this research):

### 4.1 Lattice-side: harness infrastructure

| Work | Risk | Notes |
|---|---|---|
| Implement `lattice-project.toml` + `lattice-platform.toml` loaders in executor | Low | read-once at session start |
| Migrate executor 2 hardcodes (`reconcile.ts:177`, `todo-queue.ts:33-37`) + comment fix at `coherence.ts:583` | Low | addressed by TOML |
| Implement template-variable substitution in skill node executor (`{{lattice.x.y}}`, `{{platform.x.y}}`) | Low | extension of existing `template.ts` |
| Author `validate-skill-shape.sh` per-skill structural test (per F-3 fix; new `scripts/`) | Low | generalizes existing `write-review-gate.sh` 7-anchor pattern |
| Author `_shapes/<skill>.shape.yaml` for each of the 7 HEAVY skills (per R2-F4 — heading anchors + content anchors per `07-proposed-skills.md` §8.1b) | Low | pattern set by first manifest; subsequent ones are mechanical |
| Author `audit-harness-pillar.py` (deny-list scanner with version-pin + scope-qualifier per `07-proposed-skills.md` §4.6 R2-F2 fixes) | Low | same shape as `audit-corpus-citations.py` plus exempt-comment honor |

### 4.2 Lattice-side: skill prompt migration

| Work | Risk | Notes |
|---|---|---|
| Re-author 17 path+domain-term skills to use template variables (Defects 3, 5, 6, 7 from `04` §5.3 — TOML alone is insufficient per F-2) | Low | mechanical but volume is real |
| Re-author 5 path-only skills (Defects 1, 2, 4, 8 fully closed by TOML) | Low | pure path indirection |

### 4.3 Lattice-side: library carve-out (Option B vendoring)

| Work | Risk | Notes |
|---|---|---|
| Carve `lattice-core/` (executor + clean skills + agents + workflows + harness-grade scripts + scaffold) | Medium | versioning + release discipline once; reassess at n=2 consumers (R1 LBC-2 caveat) |

### 4.4 Datagrok-side: platform pillar authoring

This work is owned by the Datagrok team per workplan W1.A1, A2, A3. It does not block harness-side work but does block first-DG-plugin-port.

| Work | Risk | Owner |
|---|---|---|
| Author `lattice-platform.toml` for Datagrok (`grok` CLI verbs, scaffold paths, contract triangles) | Low | Harness Architect (W1.A5 in workplan) |
| Author `dev-harness/component-map.md` (W1.A1) | Medium | Platform Knowledge Owner |
| Author `dev-harness/platform-facts.md` (W1.A2) | Medium | Platform Knowledge Owner |
| Author `commands/datagrok/` sibling skill pack (per `07-proposed-skills.md` §6) | Low | Harness Integrator |
| Author `dg-api-index.json` generator script (per R2-F6; consumes JSDoc from `js-api/`, emits machine-readable index per `01-platform-jsapi.md` §5.4 sketch) | Medium | Platform Tooling Owner |

### 4.5 Per-DG-plugin: project pillar authoring (one-time per plugin)

| Work | Risk | Owner |
|---|---|---|
| Author `lattice-project.toml` (per-plugin paths) | Low | Plugin author |
| Author project-side `system-manifest.md` + domain-knowledge-map | Medium | Plugin author |
| Re-author 7 HEAVY skills (`review.md`, `design.md`, `lint-knowledge.md`, `lit-triage.md`, `ops/check.md`, `ops/bug-stress.md`, `ops/explore-data.md`) for plugin domain | Medium | Plugin author + reviewer |
| Author `algorithm-paths.txt`, `validation-baseline.json` if applicable | Low | Plugin author |

### 4.6 First DG plugin port: ordering and dependency graph

| Phase | Owner | Depends on |
|---|---|---|
| Lattice infrastructure + skill migration (4.1-4.2) | Lattice maintainer (Larisa) | nothing — ready to start now |
| Lattice library carve-out (4.3) | Larisa + Datagrok harness integrator | 4.1 ships |
| DG platform authoring (4.4) | Datagrok platform team | nothing — parallel with 4.1 (no dependency) |
| First plugin's project pillar (4.5) | Plugin author + Datagrok | 4.3 + 4.4 |

**Why the original framing was misleading.** The first cut conflated harness-side work, DG-team-owned platform authoring, and per-plugin project-pillar authoring as if one party did all three. They are three owners on three timelines. The ordering above is what matters; calendar arithmetic is for the team that owns each line.

The migration order: TOML loader first (4.1) → executor migrations → skill-prompt migrations (4.2) → carve-out (4.3) → parallel platform authoring (4.4) and first-plugin authoring (4.5).

---

## 5. Recommended extraction strategy

From 05 §7: **Vendor (Option B) with In-place (Option C) as transitional first step.**

| Stage | Outcome |
|---|---|
| **Phase 0 — In-place reorg** | Refactor current single repo so harness-pillar code lives in one tree; `lattice-project.toml` ships and SENDEX consumes it. Defers the governance question. |
| **Phase 1 — Vendor library** | Carve `lattice-core/` (executor + workflows + hooks + agents + clean skills + harness-grade scripts + scaffold). SENDEX depends on it; Datagrok also depends on it. |
| **Phase 2 — DG sibling skill pack** (parallel with W1.A1/A2 in the workplan) | Author `commands/datagrok/` pack against the platform manifest contract. First DG plugin port consumes it. |

This sequencing matches the workplan's Phase 0 (governance + week-4 gate) → Phase 2 (pilot port) → Phase 3 (generalize) ordering.

**Why not pure in-place.** In-place defers the governance decision indefinitely. Datagrok contributors landing PRs in Larisa's repo is awkward; Larisa carrying Lattice maintenance for a third-party adopter is unsustainable. In-place is the right *prep step*, the wrong *destination*.

**Why not fork.** Forks rot. The Lattice build investment would be re-paid each time the trees drift apart.

**Why vendor wins.** Single source of truth for the harness pillar. Project pillars consume it via `package.json`-shaped dependency. SENDEX velocity is preserved through one-time friction. The donation table's "Lattice's role" framing in `datagrok-harness-workplan.md:17-22` already reads this way ("the framework owns process-level artifacts; the project owns its domain knowledge"). Vendor makes the framing executable.

---

## 6. The honest framing for a Datagrok engineer

Three claims survive the research; one weakens; one is novel.

**Survives:**
1. Lattice's seven-piece taxonomy (skills / sub-agents / workflows / hooks / state / audits / knowledge) generalizes. None of the 8 surveyed systems matches it, but several open-source frameworks (OpenHands, Aider, Cline) converge on subsets — markdown-as-system-prompt-fragment is universal; mode separation is widespread; git-as-truth is universal. Lattice is a unique composition with field precedent for individual pieces (03 cross-cutting §1).
2. The grok ecosystem has zero first-party agentic-dev story. Tableau, Spotfire, PowerBI, Streamlit components — none have one either (03 Group 2). The harness is a category-creating move, not a category-following one.
3. The carve-out is real but bounded. ~76% of Lattice is harness-grade today; ~24% needs the schema contract from 04 §6 + per-project re-authoring (05 §8.3).

**Weakens:**
4. The original "the harness pillar contains ZERO DG references" claim weakens to "the harness pillar, post-carve-out, contains zero DG references." The carve-out is the definition. Pre-carve-out, the claim is false at the directory level.

**Novel:**
5. Lattice's commit-trailer reconciler + four-layer authoritativeness ladder (truth lives in git, derived from `Topic:` trailers; state files are caches that drift) has no precedent in any surveyed system. This is the deepest single design choice and the one most worth preserving through any extraction. Datagrok plugins ship to a package server with their own metadata; the reconciler can grep `Topic:` trailers from plugin commits exactly as it greps SENDEX commits today (03 cross-cutting §3).

---

## 7. The single most important decision

**Is the testable claim a working hypothesis, or a hard architectural commitment?**

- **As a hypothesis** (defended/refuted by evidence per project), the research above says PARTIALLY — fix the carve-out, ship the schema contract, and the claim is defensible for any project that adopts the carve-out faithfully.
- **As a commitment** (the harness pillar is *required* to be DG-free), the research says: the test passes after the migrations in §4. Datagrok cannot land a single DG-specific reference into `lattice-core/` without breaking the commitment.

If the team treats it as a commitment, the architecture in §3 is mandatory. If it's a hypothesis, the architecture is recommended but the team can land DG-specific code in shared trees as long as it's documented.

**Recommendation: treat it as a commitment, enforced by an audit script.** Lattice already has `audit-corpus-citations.py`, `audit-knowledge-graph.py`, etc. — a `audit-harness-pillar.py` that greps `lattice-core/` for the canonical SENDEX/DG token-list and fails the build if any are found is the natural enforcement. The commitment is then mechanical, not aspirational.

---

## 8. Summary

| Question | Answer |
|---|---|
| Does the harness pillar contain zero DG references today? | **No.** ~24% of Lattice has SENDEX coupling at the file level. |
| Does it post-carve-out, with the schema contract? | **Yes.** Audited as such in 05 §8.4. |
| What's the contract? | `lattice-project.toml` (per-project) + `lattice-platform.toml` (per-platform) + a sibling DG skill pack. (§3) |
| What's the extraction path? | In-place reorg → vendor library `lattice-core/` → DG sibling pack. (§5) |
| What's the precedent in the field? | None for the full composition; OpenHands closest analogue; BI plugin platforms have zero agentic-dev story. (§6) |
| What's the single hardest enforcement? | The audit script that fails the build if any SENDEX/DG token appears in `lattice-core/`. (§7) |

**Cross-references:**
- Per-pillar carve-out inventory: 05 §7.4
- TOML schema sketch: 04 §6.1
- Coupling defects + fixes: 04 §5.3, 05 §6 / §8
- Workflow comparison: 03 cross-cutting §1-§5
- Skills proposal: 07
- Question buckets for thread: 06
