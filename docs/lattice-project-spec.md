# lattice-project.toml — schema spec

> **Status:** Phase 0 of SENDEX/Lattice decoupling (see `research/dg-harness/decoupling-handoff.md` §6).
> **Scope:** the contract between the harness (`commands/lattice/`, `agents/`, `executor/`, `scripts/`, `workflows/`) and a project that consumes it. Defines what `lattice-project.toml` is, what keys it carries, how skill bodies template against it, and how greenfield projects opt out of project-content surfaces they don't have.
> **Companion:** `lattice-platform.toml` for ecosystem-specific operational skills (e.g. Datagrok plugin operations). Out of scope for this doc; covered in a sibling spec when DG team authors it.

---

## 1. Why this exists

The harness must work against any project (SENDEX today, a Datagrok plugin tomorrow, a greenfield app in 6 months). Skill bodies that hardcode `docs/_internal/research/REGISTRY.md` or `cd C:/pg/pcc/frontend && npm run build` cannot serve a second consumer. `lattice-project.toml` is the thin indirection layer that lets the same skill body run on N projects.

**The model in one sentence:** the harness ships skill *shapes* (failure-mode mitigations, cycle structure, review hygiene); each project supplies *values* (paths, runtime commands, domain content) via this TOML and a small set of project-side content files referenced by the TOML.

**Validated on 4 dog-food slices** (bug-fix, review, distill, probe — see `research/dg-harness/decoupling-handoff.md` §4 + §4b). The same ~8 buckets recur across all four; the schema is small.

## 2. Three layers, one TOML per layer

```
+------------------------------------------------------+
| Layer 1 - Harness                                    |
|   commands/lattice/  agents/  executor/  scripts/    |
|   workflows/  docs/skills-includes/                  |
|   (universal dev-process discipline; failure-mode    |
|    mitigations; cycle structure; review hygiene)     |
+------------------------------------------------------+
| Layer 2 - Platform pack (optional, 1 per platform)   |
|   commands/datagrok/  (or commands/streamlit/ ...)   |
|   lattice-platform.toml  (entity registry, build,    |
|     publish commands, contract triangles)            |
|   (ecosystem-specific operations; only present when  |
|    the project sits on a platform)                   |
+------------------------------------------------------+
| Layer 3 - Project pillar (1 per project)             |
|   lattice-project.toml  (THIS SPEC)                  |
|   docs/_internal/skill-content/*.md  (multi-line     |
|     project content referenced by the TOML)          |
|   knowledge files, validation refs, etc.             |
|   (domain content, paths, runtime commands)          |
|   NO PROJECT-SIDE SKILLS - per Correction 1          |
+------------------------------------------------------+
```

**Cardinality:** Layer 1 is shared across every project; Layer 2 is shared across every project on the same platform; Layer 3 is per-project.

**Composition:** harness cycles invoke platform-pack skills as sub-skills when synthesis plans call for ecosystem-shaped operations. Projects never define skills; they define values.

## 3. Pattern A: template substitution

Skill bodies reference TOML values via Mustache-style template tokens:

| Form | Resolves to | Use when |
|---|---|---|
| `{{lattice.<bucket>.<key>}}` | The literal value of `[<bucket>] <key>` in `lattice-project.toml` | Single-line values: paths, commands, scalar config |
| `{{include:project.skills.<name>.<key>}}` | The full text of the file pointed to by `[skills.<name>] <key>` | Multi-paragraph content: persona, domain expertise, pattern families, exemplar lists |
| `{{platform.<bucket>.<key>}}` | Same as `{{lattice.*}}` but reads from `lattice-platform.toml` | Platform-pack composition; out of scope for this doc |

**Resolution timing:** the executor's `template.ts` substitutes tokens in skill bodies at dispatch time, AFTER the harness loads `lattice-project.toml` (and `lattice-platform.toml` if present) at session start. Substituted bodies are passed to the model; the original templates stay on disk.

**Undefined keys:** when a skill body references `{{lattice.X.Y}}` and the TOML does not define it, the substitution result is the literal sentinel `<<UNDEFINED:X.Y>>`. Skills are responsible for handling absent values in one of two ways:

1. **Abort with explanatory message** — for keys the skill cannot operate without (e.g., probe's `[project.docs] system_manifest`). The skill body must guard with `if "<<UNDEFINED:" in <token>: abort("...")` semantics.
2. **Skip the affected step** — for optional pillars (e.g., review's Step 4 MANIFEST update when `[project.docs] manifest_file` is undefined). The skill body must guard at the step boundary.

Each per-skill section in §6 below names which keys are required vs optional and the abort/skip behavior.

**`{{include:...}}` semantics:** the file path resolves relative to the project root. The file's full contents are inlined into the skill body as a single block. If the file does not exist, substitution emits a sentinel and the skill aborts (multi-paragraph content is always required when its key is set).

## 4. Schema buckets (top-level)

Total: 8 buckets + 1 per-skill namespace. Each bucket contains scalar keys; sub-tables are noted explicitly.

### 4.1 `[runtime]` — execution commands

```toml
[runtime]
build_command = "cd frontend && npm run build"
test_command = "cd frontend && npm test"
lint_command = "cd frontend && npm run lint"
python = "backend/venv/Scripts/python.exe"
dev_server_url = "http://localhost:5173"
doc_regen_steps = [
  "scripts/generate-coverage-facts.py",
  "vitest run generate-engine-reference --reporter=verbose",
  "vitest run ground-truth-validation --reporter=verbose",
]
bundle_size_baseline_kb = 1223  # optional; review.md flags regressions
```

**Required for:** ops:check, lattice:review (mechanical gate), bug-stress retro, any skill that runs project tests.

**Behavior when undefined:** ops:check aborts; review's mechanical gate skips with a warning and routes to user; bug-stress falls back to "no test command configured."

### 4.2 `[project.backlog]` — work tracking

```toml
[project.backlog]
todo = "docs/_internal/TODO.md"
roadmap = "docs/_internal/ROADMAP.md"
manifest = "docs/_internal/MANIFEST.md"  # alias of [project.docs] manifest_file when set
todo_area_taxonomy = ["Architecture", "Frontend", "Backend", "Validation", "Docs", "Tooling"]  # optional
```

**Required for:** any persist-gaps step (research-cycle, blueprint-cycle, distill, probe, review).

**Behavior when undefined:** skill aborts with "no backlog configured — run `/lattice:init` to scaffold this project."

### 4.3 `[project.research]` — research corpus

```toml
[project.research]
root = "docs/_internal/research"
index = "docs/_internal/research/INDEX.md"
registry = "docs/_internal/research/REGISTRY.md"
peer_reviews = "docs/_internal/research/peer-reviews"
distillations = "docs/_internal/research/distillations"
literature = "docs/_internal/research/literature"
literature_pdf_triage = "docs/_internal/research/literature/PDF-TRIAGE.md"
```

**Required for:** research-cycle, distill, lit-triage, peer-review's novel-source check.

**Behavior when undefined:** research-cycle aborts; distill aborts in `--audit` mode but runs in default mode if at least `registry` is set; lit-triage aborts.

### 4.4 `[project.docs]` — knowledge surfaces

```toml
[project.docs]
internal_root = "docs/_internal"
manifest_file = "docs/_internal/MANIFEST.md"  # spec-dependency tracker
system_manifest = "docs/_internal/knowledge/system-manifest.md"
domain_knowledge_map = ".claude/rules/domain-knowledge-map.md"
typed_graph = "docs/_internal/knowledge/knowledge-graph.md"
contract_triangles = "docs/_internal/knowledge/contract-triangles.md"
field_contracts = "docs/_internal/knowledge/field-contracts.md"
field_contracts_index = "docs/_internal/knowledge/field-contracts-index.md"
methods_index = "docs/_internal/knowledge/methods-index.md"
guardrails = "docs/_internal/knowledge/code-quality-guardrails.md"
```

**Required for:** probe (system_manifest is hard-required); architect, review, synthesize (typed_graph + contract_triangles when contracts are touched).

**Behavior when undefined:** probe aborts with "no system manifest configured." Other consumers degrade gracefully (e.g., synthesize emits a warning when contract_triangles is missing).

### 4.5 `[project.docs.entry]` — project-author convenience aliases

```toml
[project.docs.entry]
# Project-author convenience aliases the harness CAN reference but does not own.
# These are NOT skills (per Correction 1: no project-side skills enter the
# harness contract). They are user-invocable command names the harness body
# mentions for ergonomics; when undefined, the harness falls back to its
# native procedure or prompts the operator.
system_manifest_authoring_skill = "docs-agent"  # invoked by probe Step 1 fallback
doc_regen_skill = "regen-science"  # invoked by distill audit Step 4
validation_regen_skill = "regen-validation"
```

**Required for:** none (every entry is optional).

**Behavior when undefined:**
- `system_manifest_authoring_skill` → probe's Step 1 fallback prompt becomes "no manifest configured; please author one or run the project's manifest-authoring procedure."
- `doc_regen_skill` → distill's audit Step 4 invokes the harness's native `commands/lattice/regen-docs.md` (Phase 4 deliverable) consuming `[runtime] doc_regen_steps`.

**Note:** this bucket is the resolution for the D-R2 concept sharpening from the round-2 dog-food. Project authors are free to define their own automation aliases; the harness body never hard-names them.

### 4.6 `[project.bugs]` — bug log surface

```toml
[project.bugs]
bug_log = "docs/_internal/BUG-SWEEP.md"
```

**Required for:** ops:bug, ops:bug-stress, review's bug-registry step (5c).

**Behavior when undefined:** ops:bug aborts; ops:bug-stress aborts; review's 5c step skips with a warning ("no bug log configured — bug-fix retros not persisted").

### 4.7 `[project.scripts]` — project-tuned scripts

```toml
[project.scripts]
audit_spec_reuse = "scripts/audit-spec-reuse.py"
audit_contract_triangles = "scripts/audit-contract-triangles.py"
audit_knowledge_graph = "scripts/audit-knowledge-graph.py"
declare_commit_intent = "scripts/declare-commit-intent.sh"
query_knowledge = "python scripts/query-knowledge.py"
```

**Required for:** none (every entry is optional; harness skills check existence and skip the corresponding mechanical check when missing).

**Behavior when undefined:** review's Step 2a REUSE-ANCHOR-DRIFT check skips; review's TRIANGLE protocol skips; peer-review's algorithmic-tightening fact-lookup skips with a warning ("no typed knowledge graph configured — algorithmic claims unverified against domain truth oracle").

### 4.8 `[project.lattice]` — lattice-internal project state

```toml
[project.lattice]
algorithm_paths_file = ".lattice/algorithm-paths.txt"
reuse_anchor_baseline = ".lattice/reuse-anchor-baseline.json"
triangle_audit_baseline = "scripts/data/triangle-audit-baseline.txt"
validation_baseline = ".lattice/validation-baseline.json"
algorithm_defaults_mode = "empty"  # or "sendex" for back-compat during migration
```

**Required for:** review's ALGORITHM protocol; algorithm-defensibility gate; reuse-anchor mechanical check.

**Behavior when undefined:** review's ALGORITHM protocol falls back per `algorithm_defaults_mode` — `empty` makes the protocol advisory only; `sendex` retains today's hardcoded SENDEX paths (for back-compat during the migration window).

### 4.9 `[skills.<name>]` — per-skill content overrides

The largest single contributor to "skill body customization." Each harness skill that needs project-shaped values (persona, domain expertise paragraphs, corpus file lists, exemplar story references, exclusion globs) declares its keys here.

```toml
[skills.review]
persona = "the Review Agent for SENDEX (SEND Explorer)"
domain_expertise = "docs/_internal/skill-content/review-domain-expertise.md"
capability_model = "docs/_internal/capabilities.yaml"  # optional; review Step 3D skips when absent

[skills.review.architect]
exclude_globs = [
  # project-specific generated docs (added on top of harness baseline)
  "docs/validation/engine-output.md",
  "docs/validation/signal-detection.md",
  "docs/validation/summary.md",
]

[skills.bug_stress]
pattern_families = "docs/_internal/skill-content/bug-pattern-families.md"

[skills.distill.corpus]
# D-R1 refinement: corpus is multi-layer, not flat. See decoupling-handoff.md §4b.
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

[skills.distill.audit]
docs_to_check = [
  "docs/methods.md",
  "docs/scientific-logic.md",
  "docs/validation/summary.md",
]
# When empty, distill --audit mode prints "no docs_to_check configured; skipping audit"

[skills.synthesize]
domain_expertise = "docs/_internal/skill-content/synthesize-domain-expertise.md"

[skills.peer_review]
domain_expertise = "docs/_internal/skill-content/peer-review-domain-expertise.md"
```

**Per-skill required keys:** documented in the skill's own body. The harness ships a `validate-project-toml.py` companion script that loads each skill's manifest and reports missing required keys at session start.

## 5. The harness-side baseline files

Some skill content has a universal layer (Layer 1) baseline that projects extend rather than replace. These live in the harness repo at `scaffold/`:

| File | Used by | Project extension via |
|---|---|---|
| `scaffold/universal-bug-patterns.md` | `commands/ops/bug-stress.md` | `[skills.bug_stress] pattern_families` (project file appends to baseline) |
| `scaffold/universal-architect-exclude-globs.md` | `commands/lattice/review.md` Agent A | `[skills.review.architect] exclude_globs` (project list extends baseline) |
| `scaffold/universal-review-protocols.md` | `commands/lattice/review.md` Step 3b | not project-extensible — baseline only |

**Composition rule:** the harness substitutes the baseline first, then appends project content. Project content does NOT override baseline; it adds to it. (If a project needs to override a baseline rule, it does so in the per-skill body, not in the project content file.)

## 6. Schema versioning (skill-version-contract)

When the harness skill SHAPE evolves (new section in review, changed verdict enum), per-project re-authored content can silently diverge. The contract:

```toml
[skills.review]
expected_harness_version = "2.0"
```

The harness ships a `validate-skill-shape.sh` companion that loads each project's `expected_harness_version` and verifies the rendered (post-substitution) skill body still has the structural anchors expected for that version. Mismatches block at session start with a "harness version mismatch — re-run sync-skills.sh and reconcile your project content" message.

**Initial value:** `1.0`. **Bump trigger:** any structural change to skill body anchors (new mandatory section, changed protocol-trigger condition, changed verdict enum). Patch-level edits (typo fixes, minor wording) do NOT bump.

This addresses peer-review finding F-3 from R1 (skill-drift detection); see TODO.md ENH-08.

## 7. Greenfield projects

A project with no platform layer, no MANIFEST tracker, no validation refs, and no domain knowledge graph CAN still consume the harness:

```toml
# minimal lattice-project.toml for a greenfield app
[runtime]
build_command = "cargo build"
test_command = "cargo test"
lint_command = "cargo clippy"

[project.backlog]
todo = "TODO.md"

[project.research]
root = "docs/research"
registry = "docs/research/REGISTRY.md"

[project.docs]
internal_root = "docs"
# manifest_file, system_manifest, domain_knowledge_map all undefined
# - probe will refuse to run; that's correct (no manifest = no cross-impact)
# - review Step 4 (MANIFEST update) will skip
```

The skill bodies degrade gracefully via the abort/skip semantics in §3. Greenfield projects unlock more cycle skills as they accumulate the corresponding artifacts (manifest authored → probe activates; capability model authored → review Step 3D activates; algorithm-paths file authored → review's ALGORITHM protocol activates).

## 8. Loader contract

The executor's manifest loader (`executor/src/manifest.ts`):

1. Reads `<project>/lattice-project.toml` at session start. Missing file is fatal.
2. Reads `<project>/lattice-platform.toml` if present. Missing is fine.
3. Validates required keys against each skill's manifest (via `validate-project-toml.py`). Missing required keys for a skill make that skill unavailable for the session (skill manifest list and reason surfaced).
4. Surfaces values as:
   - Env vars (`LATTICE_PROJECT_TODO`, `LATTICE_RUNTIME_BUILD_COMMAND`, ...) for shell scripts.
   - Template namespace (`{{lattice.x.y}}`, `{{platform.x.y}}`, `{{include:project.x.y}}`) for skill bodies.

The executor never reads inside `[skills.*]` for its own logic — those keys are surfaced only to the named skill's body via Pattern A substitution.

## 9. What this spec does NOT cover

- **`lattice-platform.toml` schema** — sibling spec to be authored by the platform-pack owner (Datagrok team for the DG case).
- **Runtime command portability across OSes** — projects supply their own shell-quoted commands; the executor doesn't translate.
- **Skill manifests** — each `commands/lattice/<name>.md` declares its own required/optional keys at the top of the body. Format: TBD (Phase 1 deliverable). Until then, per-skill keys are documented in the skill body's prose.
- **Migration tooling** — Phase 3 deliverable: `scripts/migrate-to-toml.sh` that reads today's hardcoded paths from a SENDEX-shape repo and emits a draft `lattice-project.toml`.

## 10. Cross-references

- `research/dg-harness/04-project-graph.md` §6.1 — original schema sketch.
- `research/dg-harness/05-lattice-extraction.md` — per-file SENDEX-coupling audit identifying the 8 defects (4 TOML-addressable, 4 requiring re-authoring).
- `research/dg-harness/decoupling-handoff.md` §4 (bug-fix dog-food) + §4b (review/distill/probe round 2).
- `research/dg-harness/peer-reviews/dg-agentic-harness-review.md` Finding F-2 — the closure-rate framing correction (TOML closes 4 of 8, not all 8).
- `scaffold/lattice-project.toml.template` — annotated SENDEX-shape template.
