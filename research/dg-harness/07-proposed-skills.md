# 07 — Proposed Skills

> Skills the harness needs for Datagrok plugin development. Per the kickoff constraint: each proposed skill is run through a placement test (harness-pillar / platform-pillar / project-pillar) before naming. Bias is toward fewer DG-specific skills and more platform-adapter contract.

---

## 1. Already known

The workplan (`datagrok-harness-workplan.md:84`, item W1.B4) names a candidate set deferred until W3.C1: `create-package`, `add-viewer`, `add-function`, `wire-detector`, `prepare-release`. The deferral rationale is sound: "authoring skills before observing the work produces wrong skills."

This document does not authorize building any of those yet. It runs each candidate through a placement test that asks: *can the skill live in the harness pillar, and if not, why not?* The bias is to keep harness pillar lean. Most skills land in either the platform pack or per-project.

The 02-plugin-scaffolds inventory (§4) characterized what each skill *would do* against the existing scaffold. This document picks each up, applies the placement test, and answers: where it lives, what its harness/platform interface is, and whether it should ship at all.

---

## 2. Placement test

A new skill is placed by answering three questions in order:

1. **Is the skill's behavior parameterizable from the platform manifest** (`lattice-platform.toml` + `lattice-project.toml`)? If yes → harness pillar; the manifest provides DG-specific values.
2. **If no, is the skill's behavior intrinsic to the platform's API/conventions** (DG namespaces, `grok` CLI verbs, `JsViewer` lineage, `//name:` annotation grammar, `DG.SEMTYPE.*`)? If yes → platform pillar (DG sibling skill pack).
3. **If no, is the skill's behavior intrinsic to a single plugin's domain** (this plugin's knowledge files, this plugin's empirical claims)? If yes → project pillar.

A skill that fails (1) and (2) and (3) doesn't belong anywhere — it's almost certainly a candidate for splitting. A skill that passes (1) is nearly always preferable to one that passes (2) — the harness should provide the SHAPE; the platform manifest provides the BEHAVIOR.

---

## 3. Triage of the W1.B4 candidate set

| Candidate skill | Placement-test verdict | Where it lives |
|---|---|---|
| `create-package` | (1) NO — `grok create` is platform-CLI-bound; (2) YES — uses `tools/package-template/` directly | Platform pack: `commands/datagrok/create-package.md` |
| `add-viewer` | (1) NO — the constructor pattern (`extends JsViewer`, allocate via `grok_Viewer_FromJsViewer`), the `tools/entity-template/viewer-class.ts` template, and the `package.g.ts` regen behavior are DG-specific; (2) YES | Platform pack: `commands/datagrok/add-viewer.md` |
| `add-function` | (1) NO — the function-metadata grammar (`//name:`, `//input:`, `//output:`, decorator alternative) is DG-specific; (2) YES | Platform pack: `commands/datagrok/add-function.md` |
| `wire-detector` | (1) NO — the `<Name>PackageDetectors extends DG.Package` class, the `detectors.js` filename, the return-`DG.SemType` pattern are all DG-specific; (2) YES | Platform pack: `commands/datagrok/wire-detector.md` |
| `prepare-release` | (1) **YES** — the SHAPE is "run platform release pipeline." The actual command (`grok api && grok check --strict && webpack && grok publish --release`) comes from `lattice-platform.toml [build] api_regen / validator` and `[publish] command release_flag`. The skill itself is platform-agnostic. | **Harness pillar**: `commands/lattice/prepare-release.md` |

**Result:** of the five candidate skills, four are platform-pillar (DG-specific by construction) and **one is harness-pillar with platform-manifest parameterization**. The placement test eliminates the temptation to ship `dg-prepare-release` — it isn't DG-specific.

---

## 4. Additional skills the research surfaced

Beyond W1.B4, the research surfaced six additional skill candidates. Each is run through the placement test below.

### 4.1 `add-application` — register a Datagrok app

**Description:** generate a function annotated `//tags: app` with required entry point.

**Placement test:** (1) NO — `tags: app` is a DG-specific function-metadata tag. (2) YES — driven by the platform's `functionRoles[]` registry (33 entries enumerated at 01 §2.4). Lives in **platform pack**: `commands/datagrok/add-application.md`.

**Why it ships:** apps are the most-asked-for plugin entrypoint in the existing `Tutorials` and `ApiSamples` packages (02 §3.1). Skipping this leaves the natural "first DG plugin port" scenario unsupported.

### 4.2 `add-semantic-type` — register a new `DG.SEMTYPE`

**Description:** add an entry to the platform's semantic-type registry; emit the `SemTypeInfo` shape (01 §2.6); wire a detector method that returns the new type.

**Placement test:** (1) NO — semantic types ARE the DG conceptual primitive that lets columns participate in the renderer/widget/filter ecosystem. (2) YES — fully bound to `DG.SEMTYPE.*`. Lives in **platform pack**: `commands/datagrok/add-semantic-type.md`.

**Why it ships:** the workplan's W1.A2 platform-fact graph names "DG.SEMTYPE.* obligations" as a category requiring typed facts. Without a skill that mediates new-semtype creation, plugin authors invent their own conventions. The skill is the consumer of the typed-fact graph at this surface.

### 4.3 `add-connection` — register a database connection + queries

**Description:** add a `connections/<name>.json` file + `queries/<name>.sql` with `--input` annotations; per the `Chembl` package pattern (02 §3.1).

**Placement test:** (1) NO — the file structure (`connections/`, `queries/`) and annotation grammar are DG-specific. (2) YES. Lives in **platform pack**: `commands/datagrok/add-connection.md`.

### 4.4 `port-view` — port a single view from another framework into a DG plugin

**Description:** the workplan's W3.C1 spike. Port a SENDEX view (or any framework view) into a DG `JsViewer` or `ViewBase`-derived class.

**Placement test:** (1) NO — the destination is DG-specific. (2) Partial — the skill is mostly *spike-shape* (read existing component, write the platform-mapped equivalent) with a DG-specific destination. (3) Maybe — the source-side knowledge is project-specific.

**Verdict: do NOT ship as a new skill.** Use the existing `/lattice:spike` with a brief frontend-dev role overlay. The W3.C1 friction log will surface whether a dedicated `port-view` skill is needed; until then, ship is premature per the W1.B4 deferral rationale.

### 4.4a Worked example: `prepare-release.md` substitution across platforms

Per F-5 in the R1 peer review, the harness-pillar placement of `prepare-release.md` rests on the claim that the skill body is parameterizable via `{{platform.publish.command}}`. Falsifiability requires showing the substitution works for a non-DG case. Two worked substitutions:

**DG plugin** (with `lattice-platform.toml` from `08-architecture-recommendation.md` §3b):
```
{{platform.scaffold.create_command}} → grok create
{{platform.build.api_regen}}         → grok api
{{platform.build.validator}}         → grok check --strict
{{platform.publish.command}}         → grok publish
{{platform.publish.release_flag}}    → --release
```

Skill body, post-substitution: *"Run `grok api` to regenerate the API wrapper, then `grok check --strict` to validate, then `webpack` to build, then `grok publish --release`. Verify the CHANGELOG version matches `package.json` before publish."*

**Hypothetical finance-tech project** (with a different `lattice-platform.toml`):
```
[platform]
name = "fintool"
[build]
api_regen = "fintool generate-api"
validator = "fintool lint --strict"
[publish]
command = "fintool deploy"
release_flag = "--prod"
```

Skill body, post-substitution: *"Run `fintool generate-api` to regenerate the API wrapper, then `fintool lint --strict` to validate, then `webpack` to build, then `fintool deploy --prod`. Verify the CHANGELOG version matches `package.json` before publish."*

**R2-F3 caveat:** the post-substitution prose still names `package.json` as the version manifest, which is correct for npm-based platforms (DG, fintool with Node tooling) but wrong for Python-shipped platforms like Streamlit Components (`pyproject.toml`) or scientific Python packages (`setup.py`). The skill body needs a **second template variable** — `{{platform.version.manifest_file}}` (defaulting to `package.json`; a Python platform sets it to `pyproject.toml`) — and the prose restated as *"Verify the CHANGELOG version matches `{{platform.version.manifest_file}}` before publish."* This is consistent with the TOML-driven substitution model and closes the gap mechanically. **The harness-pillar placement remains correct;** the worked example just had to expose more parameterization than the original draft showed.

**Verdict:** with `{{platform.version.manifest_file}}` added, the prose context (CHANGELOG check, regenerate-then-validate-then-build-then-publish ordering) is meaningful for npm, Python, and any other-toolchain platform. The skill body is platform-agnostic in form **and** in practice — the harness-pillar placement is vindicated. This worked example resolves the F-5 falsifiability concern; R2-F3 surfaces and closes the manifest-file edge case.

The same exercise on `add-viewer.md` would NOT produce a meaningful non-DG substitution — the `JsViewer` constructor pattern, the `package.g.ts` regen behavior, and the entity template are intrinsic to DG. Confirms: `prepare-release.md` is harness-pillar; `add-viewer.md` is platform-pillar.

### 4.5 `wire-platform-checks` — wire the platform's build validator into pre-commit

**Description:** install a pre-commit hook step that runs `grok check --soft` (or equivalent platform validator) and BLOCKS the commit on failure.

**Placement test:** (1) **YES** — the skill says "wire `lattice-platform.toml [build] validator` into the pre-commit hook." The behavior is platform-agnostic; the platform manifest provides the validator command. Even the workaround for `grok check` having no JSON output (01 §3.4 — direct function invocation of the 9 exported check functions) is parameterized via `[build] direct_function_invocation`.

Lives in **harness pillar**: `commands/lattice/wire-platform-checks.md`.

### 4.6 `audit-harness-pillar` — enforce the platform-agnostic claim mechanically

**Description:** scan the `lattice-core/` carve-out for any tokens in a configured deny-list (SENDEX names, DG-specific identifiers, project-specific paths). Fail the build if found.

**Placement test:** (1) **YES** — the skill is harness-pillar by definition; it audits the harness pillar. The deny-list itself is configurable via `lattice-platform.toml` and `lattice-project.toml` (the same files declare "what NOT to leak into the harness").

Lives in **harness pillar**: `commands/lattice/audit-harness-pillar.md` (skill that wraps `scripts/audit-harness-pillar.py`).

**Why it ships:** per 08 §7, this is the single most important enforcement for the testable claim. Without a script-level audit, the claim drifts. Lattice already has the pattern (`audit-knowledge-graph.py`, `audit-corpus-citations.py`) — this is the carve-out audit in the same shape.

**Specification details** (per R2-F2 in the second peer review — three gaps require explicit handling):

1. **Deny-list update trigger.** The deny-list lives in `lattice-platform.toml [audit] deny_list`. Whenever the platform SDK ships a new public token (CLI verb, namespace, semantic-type constant), the deny-list must be updated in the same release. Mechanism: `lattice-platform.toml` carries a `[audit] platform_sdk_version_tested = "1.x"` field; the audit's CI step asserts this version equals the platform's current published SDK version. If the platform SDK has bumped without a deny-list refresh, the audit fails-loud with "deny-list version drift — update for SDK 1.y."

2. **`lattice-core` version pin.** `lattice-platform.toml [audit] lattice_core_version_tested = "1.x"` declares which `lattice-core` semver the deny-list was authored against. CI enforces this is `<=` the current `lattice-core` semver; if `lattice-core` has bumped past the tested version, audit fails-loud and the platform manifest must be re-validated. Same shape as the platform-SDK pin.

3. **File-scope qualifier.** The audit scans `commands/lattice/` and `commands/ops/` skill *command bodies* only — NOT research documents, NOT comparison tables, NOT prose discussing other systems. Implementation: file globs include the skill directories; explicit excludes apply to `commands/lattice/_archive/`, any path matching `*-research.md`, and any path matching `*-comparison.md`. Skill bodies that *intentionally* reference an excluded token (e.g., a borrow-recommendation paragraph citing JsViewer) carry a `<!-- audit-allow: token1, token2 -->` HTML comment that the audit honors. Same exemption pattern Lattice already uses for `triangle-audit:exempt` in `audit-contract-triangles.py`.

The combined effect: the audit catches DG-specific token leaks into the harness skill set, version-locks the deny-list to both platform SDK and `lattice-core`, and tolerates intentional comparative references. False positives drop; the testable claim is enforced without choking legitimate research-prose work.

---

## 5. Skills explicitly NOT proposed

The research surfaced four candidate skill names that should NOT ship. Each is rejected for a specific reason worth documenting.

| Rejected name | Reason |
|---|---|
| `dg-architect` | The user's kickoff floated this name. It would be a DG-flavored architecture-review skill. **Rejected** — `architect.md` (lattice/) and `architect-reviewer.md` (agents/) are harness-pillar (05 §2.1, §3). The DG-flavor needs are: (a) "spec lint" with platform-specific guardrails (`lattice-platform.toml [contract_triangles]`), (b) overengineering detection biased to DG's component map. Both are achievable by the existing skills consuming the platform manifest. A `dg-architect` would duplicate without need. |
| `dg-developer` | Already exists in pcc as a project-side role per `harness-for-datagrok.md:180`. It is a Datagrok-flavored *role* (= skill with persona) — useful within a plugin project, but it does NOT belong in the harness pillar. The platform pack can ship a generic `dg-developer.md` that role-flavors continuous work; per-plugin re-authoring is acceptable. |
| `dg-publish` | Subsumed by §4.1 `prepare-release` (harness-pillar with platform manifest parameterization). The dg-prefix would falsely imply DG-specificity in the harness. |
| `dg-bug-stress` | Bug-stress with DG-specific pattern families. Per 05 §2.3, `ops/bug-stress.md` is HEAVY-coupled to SENDEX. The fix is per-project re-authoring (each plugin authors its own pattern families), not a harness-level DG variant. The harness's `bug-stress` SHAPE (5-question retro, blast-radius search, oracle growth) is generic; the families are project-side. |

**Pattern across all four rejections:** the temptation is to stamp `dg-` on a skill whose SHAPE is generic. The placement test catches it every time. **The harness-pillar names should never carry a platform prefix; if they need one, the skill is in the wrong pillar.**

---

## 6. Skill placement summary

| Pillar | New skills | Notes |
|---|---|---|
| **Harness pillar** (`commands/lattice/`) | `prepare-release.md`, `wire-platform-checks.md`, `audit-harness-pillar.md` | All three consume `lattice-platform.toml`. None contains a platform-specific identifier. |
| **Platform pillar** (`commands/datagrok/` — sibling skill pack) | `create-package.md`, `add-viewer.md`, `add-function.md`, `wire-detector.md`, `add-application.md`, `add-semantic-type.md`, `add-connection.md` | DG-specific by construction. Each is bound to a specific entry in the platform's `functionRoles[]` registry or a specific entity template. |
| **Project pillar** (per-plugin re-authoring) | re-authored: `review.md`, `design.md`, `lint-knowledge.md`, `lit-triage.md`, `ops/check.md`, `ops/bug-stress.md`, `ops/explore-data.md` | Each plugin authors its own copy reflecting plugin-specific personas, file lists, and pattern families. The shape is harness-pillar; the contents are project-side. |
| **None — do not ship** | `port-view`, `dg-architect`, `dg-developer` (in harness), `dg-publish`, `dg-bug-stress` | Each rejection is documented in §5 or §4.4. |

---

## 7. Defense of platform-agnostic claim

The placement test produces a strong defense of the testable claim. Of the 12 skill candidates surfaced (5 from the workplan + 6 from research + 1 audit script):

- 4 land in the harness pillar with no platform specificity in the skill body itself.
- 7 land in the platform pillar (DG sibling pack) — explicitly platform-bound, by construction. The harness pillar does not contain them.
- 1 (`port-view`) is rejected; existing `/lattice:spike` covers the use case.
- The 4 `dg-*` rejections show that *every time* a `dg-` prefix is proposed, the right answer is either to relocate the skill to the platform pack (where the prefix is implied by directory) or to keep the skill in the harness with the platform manifest providing the values.

**The harness pillar's skill list, post-Datagrok adoption, looks identical to its skill list post-finance-tech-adoption or post-bioinformatics-adoption. The platform pack changes; the harness skills do not.**

This is the testable claim made operational at the skill level.

---

## 8. Required harness changes for skill-level template substitution

For the platform-agnostic claim to hold, the harness's skill-execution path must support template-variable substitution from `lattice-project.toml` and `lattice-platform.toml`. Today's executor (per 04 §6.2) reads cycle-state YAML and dispatches skills via the workflow node executor (`executor/src/nodes.ts`). Required additions:

1. **TOML loader at session start** — read both manifests, surface them as `LATTICE_PROJECT_*` and `LATTICE_PLATFORM_*` env vars, and as a flat `{{lattice.x.y}}` template namespace.
2. **Substitution in skill prompt loading** — the skill node executor substitutes `{{lattice.x.y}}` in the skill body before passing it to the model. Existing template syntax (`template.ts`) is the natural extension point; the audit at 05 §6 confirms it's already present.
3. **No-substitution audit** — `audit-harness-pillar.py` (§4.6) scans `commands/lattice/` and `commands/ops/` for any token in the platform/project deny-list. Skill bodies that need a specific path **must** use template variables; literal paths are a defect.

These changes are bounded (per 08 §4 work list): TOML loader, template substitution, audit script. Each is a distinct, mechanical line item — all together, the executor work needed to make the platform-agnostic claim mechanically enforceable.

### 8.1 Skill-version contract (resolves F-3 from the R1 peer review)

The R1 peer review surfaced the skill-re-authoring drift problem as the architectural gap with the highest ongoing maintenance cost: when `commands/lattice/review.md` SHAPE evolves in `lattice-core/` (new mandatory section, changed verdict enum, new structural anchor), each plugin's project-side re-authored copy of `review.md` diverges silently. The original deliverable surfaced this as an open question in 07 §9 Q5 with three candidate options (template substitution, sync script, accept drift) but did not pick one. **This section selects and specifies a concrete mechanism.**

**Mechanism: version-keyed declaration + structural test backstop.** Two cooperating pieces.

#### 8.1a `[skills.<name>] harness_version` in `lattice-project.toml`

For each HEAVY skill the project has re-authored (the 7 HEAVY/fundamental skills from `05-lattice-extraction.md` §2.3 that stay project-side), the project's TOML declares which `lattice-core/` SHAPE version the project's skill body implements:

```toml
[skills.review]
path = "commands/project/review.md"
harness_version = "1.2"        # the lattice-core SHAPE version this skill claims to implement
last_synced = "2026-04-12"      # informational; emitted by sync-skills.sh

[skills.design]
path = "commands/project/design.md"
harness_version = "1.0"        # this project hasn't tracked the 1.2 SHAPE bump yet

[skills.ops_check]
path = "commands/project/ops/check.md"
harness_version = "1.2"
```

`lattice-core/` ships with a `commands/lattice/HARNESS-VERSION.txt` (or YAML manifest) that names the current SHAPE version per skill. Bumping the version is intentional: a SHAPE change (new mandatory section, renamed verdict enum, restructured ordering) triggers a version bump in lattice-core's release; a behavioral-only change (re-worded paragraph, clarified instruction) does not.

#### 8.1b `scripts/validate-skill-shape.sh` structural test (harness-pillar)

`lattice-core/` ships a per-skill structural test that asserts the project's skill body contains the harness's required structural anchors. Pattern (generalized from `scripts/write-review-gate.sh` which already does this for the review *output* — 7 mandatory `^## NAME` anchors).

**Two anchor classes** (per R2-F1 in the second peer review — heading-only anchors miss semantic drift within section bodies):

1. **Heading anchors** (`^## NAME` regex) — assert the section exists. Cheap and reliable; catches "section deleted" drift.
2. **Content anchors** (free-form regex within a named section) — assert a load-bearing procedure or invocation is present. Example for `review.md` `## MECHANICAL CHECKS` section: `grep -q "\[TRIANGLE\]"` to assert the triangle-protocol invocation is still present after a SHAPE bump that requires it. Catches "section body stale" drift that headings alone miss.

The shape manifest names both:

```yaml
# commands/lattice/_shapes/review.shape.yaml
schema_version: 1.2
required_headings:
  - "## CHANGES"
  - "## ARCHITECT REVIEW"
  - "## DECISION AUDIT"
  - "## REQUIREMENT TRACE"
  - "## MECHANICAL CHECKS"
  - "## DOCS UPDATE"
  - "## VERDICT"
required_content_anchors:
  - section: "## MECHANICAL CHECKS"
    pattern: '\[TRIANGLE\]'
    rationale: "v1.2 added mandatory contract-triangle protocol invocation"
  - section: "## VERDICT"
    pattern: '(PASS|FAIL|PASS-WITH-CONDITIONS)'
    rationale: "v1.0 verdict-enum compliance"
```

The validator runs both checks and reports per-anchor pass/fail. **Limitation:** content anchors catch *named* drift (where the harness explicitly enumerated what the section must contain). They do NOT catch unnamed semantic drift — a paragraph rewritten in a way that changes its meaning while preserving the regex match is invisible. This residual gap requires periodic human review on `sync-skills.sh --validate` runs; the validator emits an advisory "last human review: <date>" line per skill so projects can track review cadence.

```bash
$ bash scripts/validate-skill-shape.sh review path/to/project/review.md
[OK]    review.md @ harness_version 1.2 — all 7 mandatory sections present
        (CHANGES, ARCHITECT REVIEW, DECISION AUDIT, REQUIREMENT TRACE, MECHANICAL CHECKS, DOCS UPDATE, VERDICT)

$ bash scripts/validate-skill-shape.sh design path/to/project/design.md
[FAIL]  design.md declares harness_version 1.0; lattice-core ships 1.2.
        Missing structural anchors required by 1.2:
          - "## Worked Persona Overlay" (new in 1.2)
          - "## Layout Decision Tree" (renamed from "## Layout" in 1.2)
        Run sync-skills.sh --diff design to view the SHAPE delta.
```

The test reads the harness's per-skill anchor list from a shape manifest (e.g., `commands/lattice/_shapes/review.shape.yaml`) and greps the project skill body for each. Anchors are the same `^## NAME` regex pattern Lattice already uses for review-output validation; generalizing to a skill-shape test is a small addition.

#### 8.1c `sync-skills.sh --validate` integration

The existing `scripts/sync-skills.sh` (one-way mirror from lattice → consumer) gains a `--validate` mode that:

1. Reads each `[skills.<name>]` entry from `lattice-project.toml`.
2. Compares the declared `harness_version` against `lattice-core/commands/lattice/HARNESS-VERSION.txt`.
3. Runs `validate-skill-shape.sh` for each project-side skill against the harness's current shape manifest.
4. Emits a single SHAPE-DRIFT report: which skills are version-stale, which are missing structural anchors, which are clean.

When SHAPE drift is detected, the project author sees the diff and decides: re-author to the new SHAPE, pin to the older harness version, or fail-loud at the next pre-commit until reconciled.

#### 8.1d Why this resolves F-3

The R1 peer review noted three candidate mechanisms (template substitution, sync script, accept drift) and the deliverable did not choose. The proposal above is **(c) version-keyed schema + (b) structural test backstop** — the strongest combination. Pure template substitution (option a from F-3) is heavier (every HEAVY skill becomes a Jinja template) and more invasive. Pure sync-script-without-tests (option b alone) catches version drift but not anchor drift within a version. Pure version-pinning (option c alone) catches version drift but doesn't catch silent SHAPE breakage when the harness ships a non-bumped change.

**Combined scope:** author `validate-skill-shape.sh`, one `_shapes/<skill>.shape.yaml` anchor manifest per HEAVY skill (7 manifests), and extend `sync-skills.sh` with a `--validate` mode. One-time harness-side work, amortized across all consumer projects forever. Project-side cost: one TOML stanza per re-authored HEAVY skill (~10 lines).

This becomes a Phase 0 deliverable (per 05 §7.4 sequencing) — alongside the in-place reorg and TOML loader, ship the skill-version contract before any project re-authoring happens at scale. The `08-architecture-recommendation.md` §4 work list includes it as an explicit line item.

---

## 9. Open questions for thread discussion

1. **Should `prepare-release` belong to the harness pillar or platform pack?** The placement test says harness pillar (the SHAPE is "run platform release pipeline"). But the skill body necessarily references `grok` CLI verbs — even via template substitution, the substitutions look DG-shaped. Counter-strawman: ship `prepare-release` in the harness pillar with the body written in terms of `{{platform.publish.command}} {{platform.publish.release_flag}}`; never name `grok` in the skill body. Does that survive a code-review smell test?

2. **Where does `wire-detector` live if a non-DG plugin pillar also needs detector-shape behavior?** Streamlit components have a "register a custom widget" analog; PowerBI custom visuals have a `pbiviz.json` registration step. The pattern (register an entity in the platform's discovery mechanism) is reusable. Strawman: harness pillar ships `register-platform-entity.md` parameterized over `[platform.entity_types]`; DG sibling pack does not need its own `wire-detector.md` at all. This eliminates 1 of the 7 platform-pack skills above.

3. **What's the Spike vs Build distinction for the W3.C1 view-port?** The current `/lattice:spike` is bias-toward-research; the W3.C1 view-port is bias-toward-implementation. Strawman: re-frame W3.C1 as `/lattice:build-cycle` with an `incoming/spec-port-{view-name}.md` synthesized from the existing SENDEX view's documentation, rather than as a spike.

4. **Do we need a `query-platform-facts.md` analog of `query-knowledge.py`?** The platform fact graph (W1.A2) needs an executable query interface. The harness already has `query-knowledge.py` for the project-side typed graph. Options: (a) one `query-knowledge.py` that takes `--source platform|domain|all`; (b) two scripts; (c) one harness-level query interface that the project's script implements. Strawman: (a), per the workplan W1.B1 which already proposes the `--source` flag.

5. **How do per-project HEAVY-skill re-authorings stay in sync with harness-pillar skill structure changes?** ~~Open question.~~ **Resolved in §8.1 (added in R1 incorporation pass per F-3):** version-keyed declaration in `[skills.<name>] harness_version` + structural test backstop via `validate-skill-shape.sh` + integration into `sync-skills.sh --validate`. Scope: one-time harness-side authoring + 1 TOML stanza per re-authored HEAVY skill.

---

## Sources

- `C:/pg/lattice/docs/datagrok-harness-workplan.md` — W1.B4 candidate skill list
- `C:/pg/lattice/docs/harness-for-datagrok.md` — skill / role / agent / team taxonomy
- `01-platform-jsapi.md` — JS API surface (namespaces, classes, semantic types, function-metadata grammar, `grok check` 9-check enumeration, decorator runtime-noop finding)
- `02-plugin-scaffolds.md` — `grok create` template inventory, `grok add` mutation strategies, 5-package sample patterns
- `04-project-graph.md` — `lattice-project.toml` schema contract, schema obligations on the project pillar
- `05-lattice-extraction.md` — full skill inventory with coupling verdicts, HEAVY-skill list, donatable-as-is set
- `08-architecture-recommendation.md` — `lattice-platform.toml` proposal, layered contract, sibling skill pack model
