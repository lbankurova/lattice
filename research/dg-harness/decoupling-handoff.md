# Decoupling — Handoff & Plan

> **Purpose:** capture post-research-validation refinements that are NOT yet in the formal research deliverable (01-08 + README + deck). The deliverable is validated through R1+R2 peer review; this doc is the living plan that emerged from subsequent discussion. **Read this AND the research deliverable to resume the work cold.**
>
> **Date:** 2026-05-07
> **Prior reading order if cold-starting:** README.md → 06-questions-for-discussion.md → 08-architecture-recommendation.md → THIS DOC.

---

## 1. Where we are

- Research cycle on dg-agentic-harness is **complete and validated** (R1+R2 peer review, corpus coherence audit, probe). 9 files at `C:/pg/lattice/research/dg-harness/` plus 2 peer reviews.
- The deck (`dg-agentic-harness-deck.html`) has been rewritten for DG plugin developer audience (was Lattice-extraction-shaped, now developer-narrative-shaped). Effort estimates stripped throughout. Mermaid syntax issue on slide 8 fixed.
- Subsequent conversation refined the architecture in three significant ways that **supersede portions of the formal deliverable**. Refinements are listed in §3 below. Deliverable text was NOT edited to reflect these; they live here until we decide whether to revise.

## 2. The two corrections that changed the architecture

The deliverable said: 6 HEAVY skills + 1 fundamental skill must be **moved out of the harness** to the project pillar (Pattern B). User pushed back twice; both were right.

### Correction 1: no skill leaves the harness — all are parameterized (Pattern A only)

**User's argument:** "the cycle and agents are designed to address LLM limitations, so the overall structure should hold. So the review can't be just project based — should be parameterized. Same for distill — it works the corpus. The skill should hold but the project should point to where and what the corpus is in the project context."

**Why this is right:** the failure-mode mitigations encoded in skill SHAPES are universal. The 7-section review format, 5-question retro, corpus-load → audit → thesis flow, OPS_CHECK_VERDICT contract, 5-dimension peer review — none of these are SENDEX. What's SENDEX is the **content the skill operates on** — persona, domain expertise paragraphs, corpus file list, pattern-family enumeration, engine-module names. The original audit conflated "lots of SENDEX content" with "structurally SENDEX-shaped." They're different.

**Verdict:** ALL 35 skills stay in `commands/lattice/`. None move. The harness ships the SHAPE; the project supplies VALUES via `lattice-project.toml` (literal strings) or `{{include:...}}` pointers to project-side content files (for multi-paragraph domain content).

**Worked examples:**

```toml
# SENDEX's lattice-project.toml

[skills.review]
persona = "the Review Agent for SENDEX (SEND Explorer)"
domain_expertise = "docs/_internal/skill-content/review-domain-expertise.md"  # multi-paragraph SEND/FDA-tox section
mechanical_gate_command = "cd frontend && npm run build && npm test"
doc_regen_steps = [
  "scripts/generate-coverage-facts.py",
  "vitest run generate-engine-reference",
]

[skills.distill]
corpus_files = [
  "docs/_internal/knowledge/system-manifest.md",
  "docs/_internal/knowledge/scoring-engine-model.md",
  "docs/_internal/knowledge/methods-index.md",
  "docs/_internal/knowledge/species-profiles.md",
  "docs/_internal/knowledge/vehicle-profiles.md",
]
audit_target = "domain corpus contradictions"

[skills.bug_stress]
pattern_families = "docs/_internal/skill-content/bug-pattern-families.md"

[skills.ops_check]
build_command = "cd frontend && npm run build"
engine_modules = [
  "backend/services/analysis/classification.py",
  "frontend/src/lib/derive-summaries.ts",
]
```

**Implication for deliverable:** 05 §2.3 calls 6 skills "HEAVY" implying they move to project; that classification still describes parameterization volume but no longer implies a different destination. 08 §2, 08 §6, deck slide 11 drill-down also have this language. **Not yet edited** in the deliverable per user instruction.

### Correction 2: platform DOES have its own skill pack (it's not just data + templates)

**User's argument:** "Datagrok should and will have its own (harness-agnostic) set of skills. We can't push it all into lattice — it's neither scalable nor meaningful. Lattice should be both platform agnostic AND datagrok compatible."

**Why this is right:** I'd over-collapsed in the prior turn by saying "no DG skills, just data + templates, generic add-entity in the harness." That doesn't scale: DG has many operations beyond entity-add (validate function metadata grammar against the JS API contract; wire semantic-type detectors with auto-detection from column-name patterns; generate help/develop/-style markdown from JSDoc; audit package roles; etc.). Each is a named skill with DG-specific shape. They USE the harness's primitives (cycle structure, agent invocation patterns, verdict format, attestation pattern) but their content is DG-shaped.

**Verdict (the corrected three-layer picture):**

| Layer | Contains | Owner | Where |
|---|---|---|---|
| **Harness / framework** | Cycle skills + reviewer agents + workflow runner + hooks + locks + generic dev-process skills (synthesize, implement, review, probe, distill, peer-review, spike, autopilot, etc.) | Lattice maintainer | `commands/lattice/` + `agents/` + `executor/` + `workflows/` |
| **Platform skill pack** | Platform-specific operational skills: `add-viewer`, `add-function`, `wire-detector`, `prepare-release`, `audit-package-roles`, `generate-help-doc`, `validate-semtype-coverage`, etc. | Datagrok platform team | Separate repo or pack, discovered by harness via `lattice-platform.toml` `[platform.skill_pack]` pointer |
| **Project pillar** | `lattice-project.toml` + skill-content files (review persona, distill corpus list, bug pattern families) + domain knowledge | Plugin author (Larisa for SENDEX) | per-plugin repo. **No skills.** |

**Cardinality:**
- Harness = **1**, shared across every project everywhere
- Platform skill pack = **1 per platform** (DG has one; Streamlit would have one; greenfield projects use no pack)
- Project = **N** (one per plugin)

**Composition:** harness cycles invoke platform-pack skills as sub-skills when synthesis plan calls for platform-shaped operations. The synthesis output should be **structured** (YAML block of operations) so the build-cycle workflow iterates without LLM routing.

**Discovery mechanism** in `lattice-platform.toml`:

```toml
[platform]
name = "datagrok"
skill_pack = "commands/datagrok"   # harness loads skills from here in addition to commands/lattice/
manifest_version = "1.0"

[platform.entities]
# what entity types exist (consumed by individual add-viewer/add-function skills in the pack,
#   OR by a generic add-entity skill if the pack chooses to ship one)
```

**Implication for deliverable:** the deck slide 5 (the bridge) currently shows "DG skill pack" as one of three things to author — that part is **right**. But the deck doesn't yet articulate the cleaner separation that platform pack is REAL SKILLS with DG-shaped content, distinct from generic harness skills. **Not yet edited** in the deliverable per user instruction.

## 3. The corrected three-layer model — universal statement

After both corrections, the consistent picture:

- **Skills that are dev-process / cycle / failure-mode mitigations** → live in HARNESS, parameterized via Pattern A (project supplies values via `lattice-project.toml`).
- **Skills that are ecosystem-specific operations** → live in PLATFORM PACK (separate from harness, ecosystem-specific).
- **No project-side skills.** Project is all config + content (consumed by harness skills).

**Why the asymmetry between project and platform:**
- A project's specificity comes from its DATA (knowledge graph, validation refs, persona, examples). Data is the right shape for project content.
- A platform's specificity comes from its OPERATIONS (entity-add procedures, build/publish commands, validator integrations) — these need to be expressed as procedures, i.e., skills. A platform also has data (component map, fact graph), but operations are first-class.

**For greenfield projects:** Layer 2 is the technical STACK rather than a platform. SENDEX-today's stack = Python+FastAPI+React+Vite+pytest+vitest. There's no skill pack today (nothing equivalent to `commands/datagrok/`). The framework is platform/stack-agnostic; greenfield projects bring the stack-knowledge in via `lattice-project.toml` runtime commands.

**For SENDEX-on-DG (future):** Layer 2 = Datagrok plugin pack (`commands/datagrok/`). SENDEX is a project consuming both the harness AND the DG pack.

## 4. Dog-food: bug-fix + tests slice on Lattice today

User asked to dog-food the layer model on the bug-fix surface. Full classification table at `C:/pg/lattice/research/dg-harness/decoupling-handoff.md` §4 (THIS section). Summary:

### Layer 1 — Harness (universal CI discipline)
- 5-question retro structure (Root cause / Genesis / Detection gap / Prevention class / Lattice change) — currently mislocated in pcc CLAUDE.md rule 20; **should move to lattice CLAUDE.md + commands/ops/bug-stress.md body.**
- Two-failure escalation (CLAUDE.md rule 9) — same. Mislocated in pcc.
- Pre-commit hook BLOCKS `fix:` commits without retro — correctly located in lattice/hooks/.
- `bug-fix-cycle.yaml` workflow DAG — correctly located.
- `commands/ops/bug.md` — skill SHAPE universal; log path is project value. **Pattern A fix:** consume `[bug_log]` from `lattice-project.toml`.
- `commands/ops/bug-stress.md` — skill SHAPE universal; HEAVY-tagged because of tox examples + tox pattern families baked in. **Pattern A fix:** pattern families come from project content file.
- Generic universal pattern families (off-by-one, race, null-deref, encoding-mismatch, regex backtracking, lock-acquisition-order) — not catalogued anywhere today. **Net new:** ship as `lattice/scaffold/universal-bug-patterns.md`.
- Executor + script tests — correctly located in lattice.

### Layer 2 — Platform/stack
- "Python+Windows files default to cp1252; specify `encoding='utf-8'`" — stack-specific (Python+Windows). Today in pcc CLAUDE.md "Key Patterns." **Stack-content** — should move to a stack-pack once consumer #2 exists; for now keep in pcc, mark as stack-content.
- "verbatimModuleSyntax requires `import type`" — stack-specific (TS strict). Same.
- "React Query 5-min stale cache shares data across components" — stack-specific (React+RQ). Same.
- Test commands (`pytest`, `npm test`, `vitest`) — stack-specific. Today: pcc CLAUDE.md + ops/check hardcodes. **Pattern A fix:** move to `lattice-project.toml [runtime] test_command`.
- Build commands (`npm run build`, `uvicorn`) — same.
- Dev-server URL `localhost:5173` — same.

### Layer 3 — Project / domain (SENDEX content)
- `docs/_internal/BUG-SWEEP.md` — project's bug log (data). Correctly located.
- Tox-domain pattern families: severity-grading edge cases, NOAEL fragility, syndrome misclassification, recovery verdict edge cases, dose-arm tracing — currently **mislocated**: examples baked into `commands/ops/bug-stress.md` body. Extract to `pcc/docs/_internal/skill-content/bug-pattern-families.md`, point `lattice-project.toml [skills.bug_stress] pattern_families` at it.
- Validation tests (`frontend/tests/ground-truth-validation.test.ts`) — correctly located.
- `algorithm-paths.txt` — correctly located.
- Algorithm defensibility rule (CLAUDE.md rule 19) — split: universal SCIENCE-FLAG mechanism stays in lattice; "what counts as algorithmic for SENDEX" stays in pcc as algorithm-paths content.

### Edge cases the model has to handle
1. **Shape vs values, repeatedly.** Most artifacts are "Layer X shape + Layer Y values." Test command shape is "run project tests" (Layer 1), values are `pytest`/`npm test` (Layer 2). The model supports this via Pattern A.
2. **Stack pack chicken-and-egg.** Until consumer #2, "Python+Windows encoding" lives in pcc by pragmatism. Mark as Layer 2 content in pcc with a comment; extract when needed.
3. **Rules that span layers.** Algorithm defensibility — universal mechanism + project-specific scope. Mechanism in Lattice; scope in pcc. Clean split.
4. **Co-authored content.** Pattern families merge universal (Layer 1 baseline) + stack (Layer 2) + project (Layer 3) into one project content file. Project decides merge order; harness ships the universal baseline.

### Verdict on the model

**The layer model HOLDS.** Most edge cases resolve via Pattern A. Structural pattern that emerges:
- **Lattice ships universal baselines** as scaffold content (universal bug patterns, generic test-shape, 5-question retro template)
- **Each project ships ONE merged content file per harness-skill that needs project content** (e.g., `bug-pattern-families.md`), starting from the universal baseline, adding stack-specific + project-specific entries
- **Lattice cycle skills consume `lattice-project.toml` pointers** to those merged files

### 5 concrete actions surfaced by the bug-fix dog-food
1. Move CLAUDE.md rules 9 + 20 from pcc to lattice (universal — currently mislocated)
2. Author `lattice/scaffold/universal-bug-patterns.md` (universal baseline — net new)
3. Extract pcc's tox-domain pattern families from `commands/ops/bug-stress.md` body to `pcc/docs/_internal/skill-content/bug-pattern-families.md`
4. Add `[skills.bug_stress] pattern_families = "..."` + `[runtime] test_command = "..."` etc. to a draft `pcc/lattice-project.toml`
5. Pattern A on `bug-stress.md` body: `{{include:project.skills.bug_stress.pattern_families}}`

## 4b. Dog-food round 2: review.md + distill.md + probe.md (2026-05-07)

User asked for three additional slices before committing. All three classified into the three-layer model. **Verdict: model HOLDS for all three.** Same character of mislocations as bug-fix; no slice broke the model. Two refinements surfaced (one schema, one concept). Findings:

### review.md classification

**Layer 1 (universal review hygiene — stays in harness body):**
- 7 mandatory output sections (CHANGES / ARCHITECT REVIEW / DECISION AUDIT / REQUIREMENT TRACE / MECHANICAL CHECKS / DOCS UPDATE / VERDICT)
- Step 0 context discipline (re-read state, re-read diff)
- Step 1 parallel-agent invocation pattern (architect / decision-auditor / requirement-reviewer / peer-reviewer)
- Architect-trigger heuristics (new file / new export / new import edge)
- Step 2 four-dimension trace (WHAT / WHEN / UNLESS / HOW)
- Step 3b protocol triggers + bodies (VISUAL / DATA / TRIANGLE / ALGORITHM in `docs/skills-includes/review-protocols.md`)
- Verdict-enum loading from `docs/skills-includes/verdict-enums.md`
- Side-channel review-output file shape (`.lattice/last-review-output.md`)
- Lock acquisition + commit window discipline
- `write-review-gate.sh` + `append-attestation.sh` (lattice scripts)
- 14 anti-patterns

**Layer 2 (stack-specific — stack-pack content when consumer #2 exists):**
- Test-file glob exclusions in architect trigger: `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `test_*.py`, `*_test.py`, `__pycache__/`, `dist/`, `node_modules/`
- TS strict idioms: `verbatimModuleSyntax`, `import type` for type-only imports
- Tailwind utility class references in HOW sub-checks (`text-[size]`, `font-weight`)

**Layer 3 (project content — Pattern A migrations):**
- Persona "Review Agent for SENDEX (SEND Explorer)" → `[skills.review] persona = "..."`
- SEND Domain Expertise section (lines 8-16) → `{{include:project.skills.review.domain_expertise}}` pointing to `pcc/docs/_internal/skill-content/review-domain-expertise.md`
- Generated-doc paths in architect-trigger excludes (`docs/validation/engine-output.md`, `signal-detection.md`, `summary.md`) → `[skills.review.architect] exclude_globs` (project merges on top of harness baseline)
- Build/test/lint commands (`cd C:/pg/pcc/frontend && npm run build` etc.) → `[runtime] build_command / test_command / lint_command`
- Doc-regen sequence (4 sub-steps with `scripts/generate-coverage-facts.py`, `vitest run generate-engine-reference`, `vitest run ground-truth-validation`, capability-model diff) → `[runtime] doc_regen_steps = [...]`
- Capability-model file + structure (`docs/_internal/capabilities.yaml`, `hcd_matrix`, etc.) → `[skills.review] capability_model = "..."`; when undefined → skip Step 3D
- MANIFEST + spec lookup (`docs/_internal/MANIFEST.md`) → `[project.docs] manifest_file = "..."`; when undefined → skip Step 4
- Backlog/research/bug paths (`docs/_internal/TODO.md`, `docs/_internal/research/REGISTRY.md`, `docs/_internal/BUG-SWEEP.md`) → `[project.backlog] todo`, `[project.research] registry`, `[project.bugs] bug_log`
- Project-tuned scripts (`scripts/audit-spec-reuse.py`, `.lattice/reuse-anchor-baseline.json`, `.lattice/algorithm-paths.txt`) → `[project.scripts]` + `[project.lattice]` config keys; when undefined → skip the corresponding mechanical check
- Bundle size baseline `1,223 KB` (line 290) → `[runtime] bundle_size_baseline_kb`
- Project-specific exemplar references (BUG-031, F8 `setFindingsSetScopeCallback`, `organ-tbl`+colgroup) → generalize phrasing in skill body; project exemplars stay in BUG-SWEEP.md / commit history

### distill.md classification

**Layer 1 (universal corpus-reasoning — stays in harness body):**
- Mode taxonomy (default / `--thesis` / `--adapt` / `--audit`) and per-mode step structures
- Layer 0/1/2/3 corpus-load pattern with deep-read budget (15 files)
- Evidence-tier discipline (decided > peer-reviewed > unreviewed > inference)
- Citation requirements (`[source: file.md, section "X"]`)
- Knowledge-promotion 3-step flow (P1 identify → P2 prompt → P3 record), operator-gated
- Persist-gaps protocol shape (research → REGISTRY, data/doc → TODO)
- 8 constraint rules (intellectual honesty, code-claims-need-code-evidence, etc.)
- Composition table (which downstream skill consumes which mode's output)

**Layer 2 (stack-specific):**
- File glob `*-synthesis.md` (line 32) is mostly project convention — treat as Layer 3.
- Otherwise: **none**. Distill is a corpus-reasoner; no stack-specific concerns.

**Layer 3 (project content — Pattern A migrations):**
- Corpus file lists (multi-layer: `Layer 0`, `Layer 1`, `Layer 2 index`, `Layer 2 peer-reviews`) — see schema refinement D-R1 below
- Audit-mode doc inventory (`docs/methods.md`, `docs/scientific-logic.md`, `docs/validation/summary.md`, `docs/_internal/knowledge/*.md`) → `[skills.distill.audit] docs_to_check = [...]`; when empty → audit-mode skipped
- Distillations output dir (`docs/_internal/research/distillations/`) → `[project.research] distillations_dir`
- Project regen-skill alias `regen-science` (lines 338, 399) → see concept sharpening D-R2 below
- Project domain-knowledge-map reference (`.claude/rules/domain-knowledge-map.md`) → `[project.docs] domain_knowledge_map`; when undefined → fall back to project's `CLAUDE.md` "Where Rules Live" table per the existing skill text
- GAP-208 exemplar reference (line 496) → generalize phrasing
- Backlog/research paths — same as review.md

### probe.md classification

**Layer 1 (universal cross-impact — stays in harness body):**
- 3 modes (default / `--integrity` / `--safety`)
- 5-step protocol (load manifest → blast radius → classify → check registry → report)
- Verdict enum table (SAFE / PROPAGATES / BREAKS / SCIENCE-FLAG / STALE / RECONSIDER-SURFACE) — sourced from `docs/skills-includes/verdict-enums.md`
- 3-hop blast-radius limit
- Structured `probe_outcome` YAML schema for cycle-state writes
- SCIENCE-FLAG protocol pointer (to `docs/skills-includes/science-flag-protocol.md`)
- Integration points (research-cycle Step 6.5/7.8, blueprint-cycle Step 3, `/ops:impact`, ad-hoc, `--safety`)
- 5 rules (read manifest, 3-hop limit, SCIENCE-FLAG non-negotiable, etc.)

**Layer 2 (stack-specific):** **none**. Probe is system-graph reasoning.

**Layer 3 (project content — Pattern A migrations):**
- System-manifest path (`docs/_internal/knowledge/system-manifest.md`) → `[project.docs] system_manifest`; when undefined → skill aborts with explanatory message (probe is fundamentally manifest-dependent)
- Manifest-authoring entry point (`/docs-agent`, line 41) → see D-R2 (project alias)
- Research registry/index paths → same `[project.research]` keys as review/distill
- TODO path + Area-tag taxonomy → `[project.backlog] todo` + optional `[project.backlog] todo_area_taxonomy = ["Architecture", "Frontend", ...]`; when undefined → freeform tags
- Examples in skill body (lines 9-13 input examples, line 78 RECONSIDER-SURFACE example, line 203 gLower threshold worked example) → generalize to harness-neutral phrasing; project exemplars don't need Pattern A (re-author once, generic)

### Schema refinement D-R1 (surfaced by distill): corpus is multi-layer, not flat

The bug-fix dog-food's TOML sketch had `[skills.distill] corpus_files = [...]` (flat). Distill's Step 0 actually loads a 3-layer corpus (always-full / always-full-decided / scan-titles) plus a deep-read budget. Refined sub-table:

```toml
[skills.distill.corpus]
always_full = [
  "docs/_internal/research/REGISTRY.md",
  "docs/_internal/knowledge/system-manifest.md",
  "docs/_internal/knowledge/scoring-engine-model.md",
  "docs/_internal/incoming/*-synthesis.md",
  "docs/_internal/knowledge/methods-index.md",
  "docs/_internal/knowledge/species-profiles.md",
  "docs/_internal/knowledge/vehicle-profiles.md",
]
index_only = [
  "docs/_internal/research/INDEX.md",
]
peer_review_dir = "docs/_internal/research/peer-reviews/"
deep_read_budget = 15
```

Update the schema spec at Phase 0 (lattice-project-spec.md) to reflect this.

### Concept sharpening D-R2 (surfaced by distill + probe): project-defined skill aliases

Distill references `regen-science`. Probe references `docs-agent`. Both are **project-author convenience aliases** — names projects use for their own ergonomic automation, NOT harness skills. Per Correction 1 (no project-side skills in the harness contract) these aliases live outside the harness, but the harness body shouldn't hard-name them either.

**Resolution:**
- Project-author convenience aliases are **outside the harness contract**, period. They're project ergonomics — invoked by humans, not by harness cycle skills.
- When a harness skill mentions "the project's regen procedure" or "the project's manifest-authoring procedure," it does so via `[project.docs.entry]` config keys with abstract names:
  - `[project.docs.entry] system_manifest_authoring_skill = "docs-agent"` (when undefined → harness prompts user to author manually)
  - `[project.docs.entry] doc_regen_skill = "regen-science"` (when undefined → harness invokes its own `regen-docs` body using `[runtime] doc_regen_steps`)
- The harness can also ship a generic `commands/lattice/regen-docs.md` skill that consumes `[runtime] doc_regen_steps` directly — making most projects' ad-hoc `regen-science` aliases redundant. Recommended.

**Implication:** today's pcc `regen-science` and `regen-validation` are project-author conveniences that wrap procedures the harness will eventually subsume via Pattern A. Don't migrate them; let them wither once `commands/lattice/regen-docs.md` ships.

### Cross-cutting recurrence: the schema is small

Across 4 dog-foods (bug-fix + review + distill + probe), the same `lattice-project.toml` buckets keep recurring:

| Bucket | Keys | First seen |
|---|---|---|
| `[runtime]` | `build_command`, `test_command`, `lint_command`, `doc_regen_steps`, `bundle_size_baseline_kb` | bug-fix |
| `[project.backlog]` | `todo`, `todo_area_taxonomy` (optional) | bug-fix; refined by probe |
| `[project.research]` | `registry`, `index`, `distillations_dir` | review/distill |
| `[project.docs]` | `manifest_file`, `system_manifest`, `domain_knowledge_map` | review/probe/distill |
| `[project.docs.entry]` | `system_manifest_authoring_skill`, `doc_regen_skill` (optional aliases) | distill/probe |
| `[project.bugs]` | `bug_log` | bug-fix |
| `[project.scripts]` | `audit_spec_reuse` (and other project-tuned scripts) | review |
| `[project.lattice]` | `algorithm_paths_file`, `reuse_anchor_baseline` | review |
| `[skills.<name>]` | per-skill: `persona`, `domain_expertise`, `corpus`, `audit.docs_to_check`, `architect.exclude_globs`, `capability_model`, `pattern_families` | per-skill |

**Total: ~8 buckets + per-skill overrides.** Schema is small because most multi-paragraph project content lives in `docs/_internal/skill-content/` files referenced via `{{include:...}}`, not in the TOML. Confirms the 04 §6 schema sketch was on the right track.

### Action items added by round 2

(Numbered continuing from §4 list above.)

6. Extract review.md's "SEND Domain Expertise" section to `pcc/docs/_internal/skill-content/review-domain-expertise.md` and Pattern-A the body.
7. Generalize SENDEX-specific examples in review.md (BUG-031 / F8 / organ-tbl), distill.md (GAP-208), and probe.md (input examples / gLower threshold) to harness-neutral phrasing.
8. Author `lattice/scaffold/universal-architect-exclude-globs.md` baseline: `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `test_*.py`, `*_test.py`, `__pycache__/`, `dist/`, `node_modules/`. Project merges its generated-doc paths on top.
9. Refine `[skills.distill.corpus]` schema to nested sub-table per D-R1 (Phase 0 schema spec).
10. Add `[project.docs.entry]` table to schema for project-author convenience aliases per D-R2.
11. Author `commands/lattice/regen-docs.md` consuming `[runtime] doc_regen_steps`. Lets pcc retire `regen-science` and `regen-validation` aliases over time.
12. Add `[project.backlog] todo_area_taxonomy` (optional) to schema.

### Verdict on the model after round 2

**HOLDS across all 4 dog-foods.** No slice broke the model; each surfaced consistent and additive findings. Two real refinements (D-R1 schema, D-R2 concept) — both clarifications, not breaks.

**Recommendation:** commit the model. Diminishing returns on further slicing — the same character of mislocation reproduces. Start Phase 0 of §6.

## 5. Settlement (closed 2026-05-07)

**Pre-resume state:** bug-fix dog-food alone; user open to one more slice (review.md recommended).

**Round 2 result:** three additional slices (review / distill / probe) all confirmed the layer model. Two refinements surfaced (D-R1 multi-layer corpus schema; D-R2 project-author alias concept) — both clarifications, not breaks. Action item list grew from 5 to 12. See §4b.

**Settlement:** model committed. Start Phase 0 of §6.

## 6. The corrected decoupling plan

(Supersedes the version in deck slide 8 + 08 §4-§5; reflects Pattern A only, no skill movement, three-layer model with platform pack handled separately by DG team.)

### Phase 0 — branch + safety net
- [ ] Create `feat/sendex-decouple` branch in `C:/pg/lattice/`
- [ ] Tag current `master` state for diff baseline (`pre-decouple-baseline`)
- [ ] Author `lattice-project.toml` schema spec at `lattice/docs/lattice-project-spec.md` (formalize the 04 §6 sketch, refined per Pattern A)
- [ ] Author `lattice/scaffold/lattice-project.toml.template` with SENDEX-shape defaults
- [ ] Set up pcc-side test mode (sync skills from the branch instead of master)

### Phase 1 — TOML loader + template substitution in executor
- [ ] `executor/src/manifest.ts` — read both `lattice-project.toml` + `lattice-platform.toml` (when present) at session start, surface as env vars + `{{lattice.x.y}}` / `{{platform.x.y}}` template namespaces
- [ ] Tests for the loader: present / absent / malformed
- [ ] Wire loader into `engine.ts` startup
- [ ] Extend `executor/src/template.ts` to substitute templates AND `{{include:project.x.y}}` (file-content inclusion) in skill bodies before model dispatch
- [ ] Tests for substitution
- [ ] Land on master; SENDEX still works (no skills use templates yet)

### Phase 2 — fix 3 executor hardcodes
- [ ] `executor/src/reconcile.ts:177` archive path → read `[specs] archive` from project TOML (with fallback for projects without TOML during back-compat window)
- [ ] `executor/src/todo-queue.ts:33-37` fallback chain → read `[backlog] todo`
- [ ] `executor/src/coherence.ts:583` reword the informational comment

### Phase 3 — bug-fix slice as proof-of-pattern (per dog-food)
- [ ] Move CLAUDE.md rules 9 + 20 from pcc to lattice
- [ ] Author `lattice/scaffold/universal-bug-patterns.md` (universal baseline)
- [ ] Extract pcc's tox-domain pattern families to `pcc/docs/_internal/skill-content/bug-pattern-families.md`
- [ ] Author `pcc/lattice-project.toml` (initial draft with `[skills.bug_stress]` + `[runtime]` + `[backlog]` + `[specs]`)
- [ ] Pattern A on `commands/ops/bug-stress.md` body
- [ ] Pattern A on `commands/ops/bug.md` body (`{{project.bug_log}}` for log destination)
- [ ] Run a real `/lattice:cycle` bug-fix on SENDEX; validate end-to-end
- [ ] **Merge to master before continuing.** This is the riskiest phase; ship before doubling down.

### Phase 4 — apply Pattern A to remaining skills (mechanical once Phase 3 ships)
The original audit identified 24 SENDEX-coupled skills. Phase 3 covered 2. Remaining ~22 in dependency order:
- [ ] `commands/lattice/review.md` (next-most-exercised; recommended dog-food slice if user wants a 2nd dog-food before committing)
- [ ] `commands/lattice/distill.md`
- [ ] `commands/lattice/peer-review.md`
- [ ] `commands/lattice/architect.md`
- [ ] `commands/lattice/probe.md`
- [ ] `commands/lattice/synthesize.md`
- [ ] `commands/lattice/implement.md`
- [ ] `commands/lattice/research.md`
- [ ] `commands/lattice/research-cycle.md`
- [ ] `commands/lattice/blueprint-cycle.md`
- [ ] `commands/lattice/build-cycle.md`
- [ ] `commands/lattice/cycle.md`
- [ ] `commands/lattice/prioritize.md`
- [ ] `commands/lattice/autopilot.md`
- [ ] `commands/lattice/extract-learnings.md`
- [ ] `commands/lattice/lint-knowledge.md`
- [ ] `commands/lattice/lit-triage.md`
- [ ] `commands/lattice/design.md`
- [ ] `commands/lattice/ux-audit-walk.md`
- [ ] `commands/lattice/ux-audit-validate.md`
- [ ] `commands/lattice/ux-audit-file.md`
- [ ] `commands/ops/check.md`
- [ ] `commands/ops/explore-data.md`
- [ ] `commands/ops/sweep.md`
- [ ] `commands/ops/impact.md`
- [ ] `commands/ops/bug.md` (already done in Phase 3 if we group)

Each migration: edit skill body to use templates, ship the corresponding pcc content file, validate by running a cycle that exercises the skill.

### Phase 5 — `audit-harness-pillar.py` and CI gate
- [ ] Author the deny-list scanner per 07 §4.6 (with R2-F2 specifications: version-pin, scope-qualifier, `<!-- audit-allow: -->` exempt)
- [ ] Initial deny-list: SENDEX domain tokens (NOAEL, syndrome, PointCross, Nimble, etc.) + DG tokens reserved for future
- [ ] Run against `commands/lattice/` post-migration; SHOULD PASS
- [ ] Wire into pre-commit hook in lattice (BLOCKS commits that leak project tokens into harness)

### Phase 6 — branch merge + cleanup
- [ ] Run `/lattice:cycle` on the migration itself (research → blueprint → build summary)
- [ ] Run a full SENDEX validation cycle against the post-migration state
- [ ] Merge `feat/sendex-decouple` to `master`
- [ ] Tag `lattice-1.0-decoupled`
- [ ] Update Lattice README to reflect the new shape

### Cancelled vs original plan
- ~~Phase 3 (move first HEAVY skill to project)~~ — Pattern A only, no skill movement
- ~~Phase 4 (move other 6 HEAVY skills)~~ — same
- ~~Shape manifests for HEAVY skills as separate authoring step~~ — replaced by runtime check on substituted skill body
- ~~`commands/project/` directory in SENDEX~~ — not needed; project is config + content only

### What stays from R2 fixes
- Skill-version contract per 07 §8.1 still applies, but in a smaller form: `[skills.<name>] expected_harness_version` in `lattice-project.toml`. The validator is now: "after substitution, the rendered prompt has the structural anchors expected for this version." Less elaborate than original since we're not authoring 7 separate project-side skill files.

## 7. The platform side (separate workstream, not in this plan)

This document covers Lattice ↔ SENDEX decoupling. The Lattice ↔ DG-platform integration is a parallel workstream owned by the Datagrok platform team:

1. Datagrok authors `lattice-platform.toml` for Datagrok (entity registry, build/publish commands, contract triangles)
2. Datagrok authors the platform skill pack (`commands/datagrok/` — `add-viewer`, `add-function`, `wire-detector`, etc.)
3. Datagrok authors the component map (W1.A1) + typed fact graph (W1.A2)

The harness side defines the discovery + composition contract (how skill packs are loaded, how synthesis plans dispatch into pack skills, how attestations flow back). That contract is not yet sketched in detail; it's logical work for once the SENDEX decoupling lands and we know what shape the harness takes.

## 8. File index for resume

| File | What's in it |
|---|---|
| `README.md` | Executive summary + Peer Review Notes (R1+R2 incorporation log) |
| `01-platform-jsapi.md` | DG JS API surface evidence base |
| `02-plugin-scaffolds.md` | DG plugin scaffolding |
| `03-comparable-frameworks.md` | 8 comparable agentic frameworks |
| `04-project-graph.md` | `lattice-project.toml` schema sketch |
| `05-lattice-extraction.md` | Per-file SENDEX-coupling audit |
| `06-questions-for-discussion.md` | Bucketed question list |
| `07-proposed-skills.md` | Skills triage, placement test, skill-version contract |
| `08-architecture-recommendation.md` | Synthesis recommendation |
| `dg-agentic-harness-deck.html` | Reveal.js deck for DG plugin developers |
| `peer-reviews/dg-agentic-harness-review.md` | R1 |
| `peer-reviews/dg-agentic-harness-review-r2.md` | R2 |
| `peer-reviews/corpus-coherence-and-probe.md` | Step 6 + 7 results |
| **`decoupling-handoff.md` (THIS DOC)** | **Post-research conversation refinements + corrected plan** |

## 9. Resume points

When resuming:
1. Read this doc top-to-bottom (10 min).
2. Decide settlement question (§5): dog-food review.md slice OR commit based on bug-fix dog-food alone.
3. If committing: start Phase 0 of §6 (branch + scaffolding + spec).
4. If dog-fooding more: pick `commands/lattice/review.md`, classify into the three layers, identify mislocations + Pattern A migrations needed, see if the model still holds.

The cycle state file at `C:/pg/pcc/.lattice/cycle-state/dg-agentic-harness.yaml` reflects the research as complete. This doc is the post-research planning artifact.

---

*Persisted 2026-05-07 to preserve session state before context pauses.*
