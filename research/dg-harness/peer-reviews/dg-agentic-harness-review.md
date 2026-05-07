# Peer Review — dg-agentic-harness research deliverable

**Reviewer:** Independent scientific/architectural peer reviewer (blind; no project implementation context)
**Topic:** Generalizing Lattice from SENDEX-specific agentic dev framework into a platform-agnostic harness for Datagrok plugin development
**Documents reviewed:** README.md, 01-platform-jsapi.md, 02-plugin-scaffolds.md, 03-comparable-frameworks.md, 04-project-graph.md, 05-lattice-extraction.md, 06-questions-for-discussion.md, 07-proposed-skills.md, 08-architecture-recommendation.md
**Review mode:** R1 standard (Section 0 applies)
**Date:** 2026-05-07
**Tier detection:** Implementation plan / synthesis — describes what to build, architecture decisions, phased extraction sequence, acceptance criteria for generalization

---

## Section 0: Load-bearing claims extraction

```yaml
load_bearing_claims:
  - id: LBC-1
    claim: "~76% of Lattice ships as harness-pillar with the schema contract, with no DG-specific references after carve-out"
    scope:
      artifact: ["executor", "workflows", "hooks", "agents", "skills", "scripts"]
      qualifier: "post-carve-out (Option B vendor model)"
      exclusions: ["HEAVY skills", "ops/explore-data.md", "project-specific audit scripts"]
    upstream_dependency: "08-architecture-recommendation.md verdict table; drives the 4-6 week effort estimate and the 'PARTIALLY survives' framing"

  - id: LBC-2
    claim: "Vendor (lattice-core library) wins over Fork and In-place on every dimension except short-term time-to-port"
    scope:
      comparison: ["Fork", "Vendor", "In-place"]
      dimensions: ["duplication cost", "time-to-first-port", "contributor model", "governance complexity", "SENDEX velocity risk"]
    upstream_dependency: "05-lattice-extraction.md §7; drives the Phase 0/1/2 sequencing recommendation in 08 §5"

  - id: LBC-3
    claim: "All 10 workflows are donatable (harness-grade); workflow coupling is limited to one classification prompt and one permitted-sources list, both parameterizable"
    scope:
      artifact: ["workflows/*.yaml", "_includes/science-flag-resolution.yaml"]
      coupling_kind: "path + domain-term only"
    upstream_dependency: "05-lattice-extraction.md §4; supports the claim that executor + workflows constitute the cleanest foundation"

  - id: LBC-4
    claim: "The executor is functionally clean — 2 single-line path hardcodes + 1 informational comment, fixable in <50 LOC"
    scope:
      files: ["executor/src/reconcile.ts:177", "executor/src/todo-queue.ts:33-37", "executor/src/coherence.ts:583"]
    upstream_dependency: "05-lattice-extraction.md §6; the executor's cleanliness is the architectural foundation for the harness-pillar claim"

  - id: LBC-5
    claim: "No surveyed agentic dev framework (8 systems) implements Lattice's full composition: commit-trailer reconciler + four-layer authoritativeness ladder + two-round peer review + verdict-enum registry + full concurrency hygiene"
    scope:
      systems: ["Aider", "Cline", "Continue", "SWE-agent", "OpenHands", "Smol-dev", "Cursor", "mini-swe-agent"]
    upstream_dependency: "03-comparable-frameworks.md cross-cutting §2-§3; justifies framing Lattice as category-creating rather than category-following"

  - id: LBC-6
    claim: "lattice-project.toml collapses 8 categories of coupling defects into a single audit surface, making the platform-agnostic claim mechanically enforceable"
    scope:
      defects: ["Defects 1-8 enumerated in 04-project-graph.md §5.3"]
      mechanism: "TOML loader at session start → template-variable substitution in skill prompts"
    upstream_dependency: "04-project-graph.md §5-§6; the TOML proposal is the enabling contract for the full generalization claim"

  - id: LBC-7
    claim: "prepare-release.md belongs in the harness pillar (not platform pack) because it is parameterizable via lattice-platform.toml"
    scope:
      skill: "prepare-release.md"
      argument: "SHAPE is run platform release pipeline; DG-specific command comes from manifest"
    upstream_dependency: "07-proposed-skills.md §3; determines the boundary between harness-pillar and platform-pillar skill placement"
```

```yaml
falsification:
  - id: LBC-1
    verdict: bounded-negative
    search_bounds:
      databases: ["05-lattice-extraction.md per-file audit", "04-project-graph.md §5.3 defect list", "03-comparable-frameworks.md field survey"]
      time_range: "2026-05-07 snapshot"
      query_terms: ["SENDEX-coupling", "harness-pillar", "post-carve-out", "coupling audit"]
      excluded: ["actual executor source files", "actual skill file contents beyond excerpts cited"]
    no_counterexample_found: false
    counterexample:
      citation: "05-lattice-extraction.md §2.3 states '18 of 34 skills (53%) are non-trivially SENDEX-coupled' but §8.4 claims 'post-carve-out, the file-level audit shows zero SENDEX-domain references'. These two claims are reconciled ONLY by excluding 7 skills from the harness pillar. The reconciliation is internally consistent but the '76%' figure is computed over a definition of 'harness pillar' that is itself not yet implemented."
      argument: "The 76% claim is a forward-looking claim about a not-yet-extant bundle (the 'post-extraction bundle'), not a claim about the current codebase state. The deliverable defines the claim into survivability by defining 'harness pillar' as 'the subset that passes', which is tautologically satisfying but not independently falsifiable from the current state. A non-tautological version of the claim would be: 'the executor + workflows + hooks + agents + harness-grade scripts, as they exist NOW, contain zero SENDEX-coupling.' The audit in 05 §6 supports this narrower version."
      downstream_action: "CONDITIONAL — the 76% figure should be qualified as 'of Lattice-as-it-will-be-post-carve-out' not 'of Lattice-as-it-is'. The recommendation itself is sound; the presentation slightly overstates the current state. Label the figure 'projected harness-grade fraction' rather than 'current.'"

  - id: LBC-2
    verdict: bounded-negative
    search_bounds:
      databases: ["05-lattice-extraction.md §7.1-§7.3 scoring tables", "03-comparable-frameworks.md field survey"]
      time_range: "2026-05-07"
      query_terms: ["fork vs vendor vs in-place", "monorepo vs multi-repo", "library extraction cost"]
      excluded: ["actual governance cost modelling", "empirical data on harness library maintenance burden"]
    no_counterexample_found: false
    counterexample:
      citation: "05-lattice-extraction.md §7.1 claims 'Forks rot. Within 2 milestones, the two trees diverge enough that mechanical merging stops working.' This is presented as an empirical fact but no citation is offered. It is a widely-held engineering belief (the 'fork-rot' heuristic) but its applicability depends on: (a) how actively the harness pillar changes, (b) whether the Datagrok team has prior experience with libraries they maintain vs. forks they consume. For a framework that is itself in active development, fork-rot is plausible. But the claim is stated as certainty."
      argument: "Vendor (lattice-core) has its own failure mode not surfaced in the scoring: library versioning discipline + release cadence create maintenance overhead that scales as the number of consumer projects grows. At n=2 consumers (SENDEX + one DG plugin), the vendor model's overhead may exceed the fork-rot cost over a 12-month horizon. The deliverable does not model this."
      downstream_action: "CONDITIONAL — add 'caveat: vendor overhead at n=2 consumers may match fork-rot cost at 12-month horizon; re-evaluate when n>=3.'"

  - id: LBC-3
    verdict: bounded-negative
    search_bounds:
      databases: ["05-lattice-extraction.md §4 workflow audit", "actual workflow YAML excerpts cited in 04 §5.3"]
      time_range: "2026-05-07"
      query_terms: ["cycle.yaml:148-149", "_includes/science-flag-resolution.yaml", "workflow coupling"]
      excluded: ["actual workflow YAML file contents beyond cited excerpts"]
    no_counterexample_found: true
    bound_audit:
      claim_scope_field: "all 10 workflows are donatable"
      bound_scope_field: "audit covers named coupling points (cycle.yaml:148-149, science-flag include); full workflow YAML text not read in review"
      coverage: sufficient
      gap: "Claim is supported by the only two named coupling points being parameterizable; the review did not independently read all 10 workflow files but the audit method is internally consistent"
    downstream_action: "SOUND with caveat: cannot independently verify without reading all 10 workflow YAML files"

  - id: LBC-4
    verdict: bounded-negative
    search_bounds:
      databases: ["05-lattice-extraction.md §6 executor audit table", "specific line citations for the 3 hardcodes"]
      time_range: "2026-05-07"
      query_terms: ["reconcile.ts:177", "todo-queue.ts:33-37", "coherence.ts:583"]
      excluded: ["actual TypeScript source files beyond excerpts"]
    no_counterexample_found: true
    bound_audit:
      claim_scope_field: "executor is functionally clean (2 hardcodes + 1 comment)"
      bound_scope_field: "audit names 3 specific locations; claims all 16 executor files reviewed"
      coverage: sufficient
      gap: "The three coupling locations are specifically identified with file:line precision; the claim is falsifiable and specific"
    downstream_action: "SOUND"

  - id: LBC-5
    verdict: uncertain
    reason: "The comparative field survey (03) provides good coverage of 8 open-source systems against a specific 7-feature checklist. However, the comparison framework (the 7 Lattice-specific patterns) was designed by Lattice's own author. A neutral framing would ask: 'does any system implement EQUIVALENT mitigations for the same failure modes, even if via different mechanisms?' The survey partially addresses this (e.g., OpenHands microagent three-tier loading vs. Lattice's domain-knowledge-map routing) but the framing consistently defaults to 'Lattice's specific implementation is absent' rather than 'the failure mode is unmitigated.' mini-swe-agent's 65% SWE-bench result at 100 LOC is itself a challenge to several Lattice mitigations (context-rot mitigation, multi-phase cycle structure) that the survey acknowledges in 06 §F3 but does not resolve."
    downstream_action: "flagged confidence: insufficient — the novelty claims should be scoped to 'specific implementation patterns' rather than 'category of mitigation'"

  - id: LBC-6
    verdict: bounded-negative
    search_bounds:
      databases: ["04-project-graph.md §5.3 defect enumeration", "04 §6 TOML schema sketch", "07 §8 executor changes required"]
      time_range: "2026-05-07"
      query_terms: ["lattice-project.toml", "coupling defects", "template substitution"]
      excluded: ["actual executor implementation of TOML loader (not yet built)"]
    no_counterexample_found: false
    counterexample:
      citation: "04-project-graph.md §3.3 notes that the schema contract is 'partly explicit, partly implicit, and partly enforced by audit scripts that themselves live in the project.' The TOML proposal addresses the path-indirection problem but does NOT address Defect 3 (SENDEX-specific knowledge filenames hardcoded in skill text — 'species-profiles.md', 'vehicle-profiles.md') through TOML alone. The TOML solution works for path PREFIX indirection; it does not work when the skill prompt says 'read docs/_internal/knowledge/species-profiles.md' as a named knowledge artifact, because the TOML cannot tell the skill which registries a given project has. This is acknowledged as 'Defect 3: Medium severity' but the proposed fix ('skills consult the domain-knowledge-map dynamically') does not come with a concrete mechanism — it defers the question."
      argument: "The TOML proposal closes Defects 1, 2, 4, 8 (path indirection and fallback defaults). Defects 3, 5, 6, 7 (domain-term mentions, module names in prompts, exemplar wording) require active skill re-authoring that TOML cannot automate. The claim 'collapses 8 categories into a single audit surface' is only true for the path/config defects; the domain-term defects survive TOML adoption."
      downstream_action: "CONDITIONAL — scope the TOML claim to 'path/config defects (Defects 1, 2, 4, 8)'; explicitly note that Defects 3, 5, 6, 7 require separate per-skill re-authoring, not TOML resolution"

  - id: LBC-7
    verdict: uncertain
    reason: "07 §3 argues prepare-release.md belongs in the harness pillar because 'the SHAPE is platform-agnostic.' But the skill body, even with {{platform.publish.command}} substitution, is a thin wrapper over platform CLI verbs. At the limit, a harness-pillar skill that is defined entirely by template substitution is indistinguishable from a platform-pillar skill with a slightly different manifest key. The question raised in 07 §9 Q1 ('does it survive a code-review smell test?') is answered with 'yes' by assertion, not evidence. The stronger test: what would the skill body look like with substitution variables applied? If the result is 'grok api && grok check --strict && webpack && grok publish --release', the skill is DG-specific in practice even if platform-agnostic in form. For a finance project using a hypothetical `buildtool release`, the skill body would be '{{platform.publish.command}} {{platform.publish.release_flag}}'. That is harness-pillar by the placement test but hollow — it teaches the agent nothing about the release step."
    downstream_action: "flagged confidence: insufficient — the harness-vs-platform boundary for prepare-release.md requires a concrete worked example showing non-DG substitution"
```

---

## Section 1: Restate the claim

In plain terms: Lattice, an agentic development framework built specifically for the SENDEX preclinical-tox application, can be generalized into a reusable harness that any Datagrok plugin project (or non-DG project) could adopt, with only the "project pillar" and "platform pillar" varying between adopters. The research deliverable audits whether this is true, concludes it is "partially true" (~76% of the current Lattice codebase is harness-grade), identifies the concentrated coupling defects (8 categories, mostly in skill prompt text), and proposes a remediation path: a `lattice-project.toml` schema contract + a `lattice-platform.toml` adapter + a DG-specific sibling skill pack, yielding a three-phase extraction (in-place reorg → vendor library → DG skill pack) over 4-6 weeks.

The deliverable is also a landscape document for comparable systems (8 agentic dev frameworks + 4 BI plugin platforms) and a platform evidence base for the Datagrok JS API surface.

---

## Section 2: Assumptions audit

### A2-1. The harness/project boundary is stable

**Stated or implicit:** Implicit in the three-pillar architecture. The deliverable assumes that "process-level artifacts" (executor, skills, workflows, hooks) can be cleanly separated from "domain knowledge artifacts" (knowledge files, design rules, validation references) across any project type.

**Support:** Reasonable for SENDEX/DG because both are software development projects with similar cycle structures (research → build → review). The assumption breaks for projects with fundamentally different work shapes — e.g., a pure data pipeline project with no research phase, or a project with a radically different knowledge structure (no TODO.md, no spec lifecycle, no typed-fact graph).

**Condition under which it breaks:** A Datagrok plugin project that does not run research cycles (most plugins are built from established requirements, not original research) would find the research-cycle.yaml and blueprint-cycle.yaml mostly vestigial. The "harness" in that case is primarily the build-cycle + pre-commit hooks + perhaps autopilot. This is acknowledged in 06 §F3 but not modeled in the 4-6 week effort estimate.

### A2-2. All 10 workflows are parameterizable without re-authoring the cycle structure

**Stated or implicit:** Explicitly stated in 05 §4.1 ("all 10 workflows are donatable").

**Support:** The workflow YAML schema is structurally clean; coupling is at the node-prompt level. The assumption holds if DAG structure is stable.

**Condition under which it breaks:** If a DG plugin project's work cadence requires a different DAG structure (e.g., no research phase, or a platform-validation gate the current workflows don't have), new workflows need to be authored, not just parameterized. The deliverable presents "author new workflows" as a project-side activity, which is reasonable, but the 4-6 week estimate does not include workflow authoring.

### A2-3. The comparables survey is comprehensive enough to support "no precedent" claims

**Stated or implicit:** Explicitly stated in 03 cross-cutting §2 ("where Lattice has no precedent").

**Support:** 8 systems surveyed, including both well-known (Aider, Cursor, SWE-agent, OpenHands) and representative smaller ones (Cline, Continue, Smol-dev, mini-swe-agent). The survey covers academic and commercial variants.

**Condition under which it breaks:** Two categories are weakly covered. First, CI/CD-native agent frameworks (e.g., AutoCodeRover, SWE-Rex in its CI mode, Devin's project-memory feature) that operate directly on the PR/CI layer rather than as IDE assistants. Second, research-side orchestrators (Meta's SWE-Gym, DeepMind's AlphaCode pipeline) that do have multi-round review patterns. These are probably not direct competitors to Lattice's use case, but the "no precedent" claim could be weakened by a closer reading of OpenHands' v1 SDK agent-delegation architecture.

### A2-4. Token-budget constraints for always-loaded skill prompts are acceptable

**Stated or implicit:** Implicit in the design. The deliverable recommends YAML-frontmatter conditional loading (from Cline/Cursor) as a "borrow candidate" but does not make it a requirement for the harness design.

**Support:** Not provided. The deliverable acknowledges always-loaded rule files (~2000 tokens, 03 §lesson 2) would benefit from conditional loading but does not model what happens to the Datagrok harness's effective context budget when the DG sibling skill pack adds more always-loaded platform-specific context.

**Condition under which it breaks:** If the DG sibling pack (7 skills described in 07 §6) adds substantial always-loaded API context (the `dg-api-index.json` described in 01 §5.4 is proposed as a query substrate but the always-loaded component is unclear), the combined context budget could become Cursor's 40-MCP-tool ceiling problem in a different form. Cursor's ceiling is explicitly noted in 03 as "the most concrete public architectural constraint Cursor admits to" — the deliverable does not audit whether the proposed harness would hit an equivalent ceiling.

### A2-5. The commit-trailer reconciler pattern will translate to multi-developer DG plugin teams

**Stated or implicit:** Implicit in 06 §F1 (stated as an open question) and 08 §6.

**Support:** Partially addressed. 06 §F1 names this as a live question: "if DG plugin authors won't adopt the discipline, the reconciler doesn't fire." The deliverable does not resolve it.

**Condition under which it breaks:** The reconciler's design is single-developer optimized — it uses local pre-commit hooks that require per-machine setup. A DG team with 3-5 developers committing from different machines would need either centralized hook enforcement (not in the current design) or the Continue-style PR-level check (mentioned in 03 §lesson 7 as a borrow recommendation but not yet designed).

---

## Section 3: Alternative hypotheses

### AH-1. The "partially survives" verdict understates the coupling

**Claim being challenged:** 05 §2.3 summary says "18 of 34 skills (53%) are non-trivially SENDEX-coupled" but the headline is "~76% harness-grade post-carve-out."

**Alternative:** The 76% figure is correct only if the 7 excluded HEAVY/fundamental skills are treated as "project-side" by definition. But those 7 skills (review.md, design.md, lint-knowledge.md, lit-triage.md, ops/check.md, ops/bug-stress.md, ops/explore-data.md) are precisely the skills a developer uses most often during day-to-day work. Excluding them from the harness pillar means the DG team would need to re-author all 7 before the first DG plugin project could run a complete cycle. This is not "harness-grade with re-authoring" — it is "the most-used daily-driver skills need to be re-built per platform."

**Rating:** Plausible. The deliverable is internally consistent (the 76% figure is computed correctly under the given definitions) but may mislead by emphasizing the 76% number rather than the practical consequence that the most-used skills are all in the 24%.

**Evidence for:** 05 §2.3 shows the 6 HEAVY skills are `review.md` (the primary quality gate), `design.md` (the primary UI design driver), `lint-knowledge.md` (knowledge maintenance), `lit-triage.md` (literature curation), `ops/check.md` (mid-build sanity check), `ops/bug-stress.md` (post-fix stress test) — this is a high-frequency-use set.

**Evidence against:** The deliverable explicitly calls this out (06 §A4: "if 6 HEAVY skills + 1 fundamental have to be re-authored per platform AND per project, the carve-out is mostly the executor + workflows + agents + scripts"). The deliverable acknowledges the weaker framing; the question is whether the recommendation adequately reflects it.

### AH-2. The three-TOML-file contract is sufficient governance overhead deterrent

**Claim being challenged:** `lattice-project.toml` is a "low-friction" schema contract that "collapses 8 coupling categories into a single audit surface."

**Alternative:** TOML-file-based configuration is a maintenance burden. Every DG plugin project would need to author and maintain a `lattice-project.toml` (project) and consume a `lattice-platform.toml` (platform). When harness schema evolves (new TOML keys added), all consumer projects need to update. This creates a versioning contract problem similar to what any library maintainer faces. The deliverable does not propose a TOML schema versioning mechanism, migration tooling, or backward-compatibility guarantee.

**Rating:** Plausible at scale, unlikely at n=2 consumers. The version-contract problem is real for library ecosystems but may be manageable if the TOML schema stabilizes quickly.

**Evidence for:** The deliverable's own §7.1 notes "library versioning discipline + release cadence" as the vendor model's overhead. That overhead applies to the TOML schema as well.

**Evidence against:** TOML files are human-readable and diff-friendly; schema drift is visible. The deliverable proposes the TOML loader reads both manifests at session start and fails-loud on missing keys (06 §B5), which partially mitigates silent drift.

### AH-3. The harness value-claim is circular for DG plugin development specifically

**Claim being challenged:** Lattice's harness provides unique value for Datagrok plugin development via two-round peer review, concurrency hygiene, algorithm-defensibility gate, etc.

**Alternative (from 06 §F3):** mini-swe-agent hits 65% on SWE-bench Verified in 100 lines of Python. For a Datagrok plugin — which is a well-scoped TypeScript project with a well-defined platform API, clear build validators (`grok check`), and established scaffold templates — the harness overhead may not be warranted. The high-value harness features (two-round peer review, algorithm-defensibility gate, typed knowledge graph) provide the most value when the domain is deep and the algorithm is high-stakes (SENDEX's NOAEL determination). For a typical DG plugin (a new viewer, a semantic-type detector, a data connector), the scientific risk is low and the algorithm-defensibility gate may fire rarely or never.

**Rating:** Plausible. The deliverable implicitly addresses this in 06 §E5 (asking whether the DG team shares Lattice's failure-mode framing) but does not model "which harness features provide value for typical DG plugin work."

**Evidence for:** 01 §2.9 notes DG's function-role registry has ~33 named shapes, each with a canonical scaffold; 02 §3.4 shows a minimal-viable plugin is 7 source files; most plugin work fits in build-cycle + pre-commit hooks, not research-cycle or peer-review rounds.

**Evidence against:** The deliverable notes "multi-week multi-session regime" as the key discriminator (03 §smol-developer analysis) — Chem, Tutorials, and the other large packages (2941 lines, 60+ detectors) fit this regime.

---

## Section 4: Failure mode analysis

### FM-1: The TOML schema is under-specified at critical extension points

**False positive risk (TOML "succeeds" but harness doesn't generalize):** The proposed `lattice-project.toml` schema includes `[knowledge.registries]` as a key-value dict mapping registry names to file paths. But the skills that CONSUME these registries (synthesize, peer-review, distill, architect) currently hard-code specific registry names (`species-profiles.md`, `vehicle-profiles.md`) in their prompts. Making a skill consume "all registries from the TOML" requires the skill to dynamically list and read arbitrary files — a different mechanism than path substitution. The TOML proposal resolves path lookup but not dynamic registry consumption.

**Scenario:** A Datagrok plugin project configures `[knowledge.registries] api_namespaces = "dev-harness/component-map.md"`. The `synthesize.md` skill prompt still references `species-profiles.md` by name in its prose because path substitution operates on `{{lattice.knowledge.registries.api_namespaces}}` but the skill prompt would need to be rewritten to use `{{lattice.knowledge.registries.*}}` iteratively. No such mechanism is specified.

### FM-2: Skill re-authoring drift over time

**False negative risk (skill re-authoring succeeds initially but silently drifts):** The "per-project re-authoring" of HEAVY skills (review.md, design.md, etc.) creates N diverging copies of skills with the same SHAPE but different contents. When the harness-pillar skill SHAPE evolves (new section added, verdict enum changed), the per-project copies diverge without notification. 07 §9 Q5 flags this as "the central skill-extraction question" but proposes no solution beyond three options (template substitution, sync script, accept drift).

**Scenario:** harness-pillar `review.md` gets a new mandatory Section 8 (policy compliance check) in lattice-core v2.3. A DG plugin project's `review.md` (project-side re-authored copy) does not get Section 8. The project runs reviews that are structurally missing a compliance check, with no warning that the harness shape has evolved.

### FM-3: `lattice-platform.toml` ownership ambiguity

**False positive risk (platform manifest "exists" but is stale):** The deliverable proposes `lattice-platform.toml` live at the "platform root" — but who authors and maintains it? For the DG case, the workplan assigns this to the "Harness Architect (W1.A5)." If that role is not filled (06 §E3 notes this is "the prerequisite for everything"), the platform manifest either does not exist or is authored once and never updated. The harness's mechanical enforcement of the platform-agnostic claim (`audit-harness-pillar.py`) depends on the deny-list in this file being accurate. A stale deny-list means DG-specific tokens leak into the harness pillar without triggering the audit.

### FM-4: `grok check --json` workaround fragility

**01 §3.3 finding:** `grok check` has no structured output; harness wiring requires either stdout-scraping or direct function invocation of the 9 exported check functions. The deliverable proposes direct function invocation as the reliable path (01 §3.5 and 08 §3b `direct_function_invocation` config field). However, this creates a tight coupling to the exact function names exported from `tools/bin/commands/check.ts`. If `datagrok-tools` adds, removes, or renames an export in a future release, the harness-side invocation breaks silently (no manifest version pinning is proposed for `datagrok-tools` in the `lattice-platform.toml` sketch).

**Scenario:** `datagrok-tools` 1.8 renames `checkFuncSignatures` to `validateFunctionSignatures`. The harness's direct-invocation wrapper still calls `checkFuncSignatures`, gets `undefined`, and the pre-commit gate silently passes everything.

### FM-5: 17 "path+domain-term" skills understated as "re-author with low friction"

**Misleading confidence risk:** 05 §2.3 classifies 17 skills as "port-with-re-authoring" (domain-term coupled but shape is generic). The deliverable frames this as amber/medium coupling. But "re-authoring" includes changing worked examples (PointCross → some-dg-plugin-dataset), changing domain vocabulary (NOAEL → DG-equivalent concept), and potentially restructuring sections where the SENDEX-specific framing is load-bearing (e.g., the Phase 4 oracle walk in `research.md` is listed as "opt-in via skip condition" but the skip is not mechanical — the agent must recognize the signal). A DG project that ports 17 skills without careful review would produce skills that are syntactically DG but semantically SENDEX.

---

## Section 5: Literature check

This is an architecture research deliverable, not a domain science deliverable. The relevant "literature" is the peer-reviewed or widely-cited engineering corpus on agent orchestration, developer tool design, and software framework extraction.

**SWE-agent paper (arXiv:2405.15793):** Correctly cited in 03. The ACI thesis — that interface design impacts agent behavior more than model capability — is foundational and the deliverable's invocation of it (the "line-numbered editor" recommendation, the "tool call as proof of consultation" rule) is accurate and well-grounded. DOI: 10.48550/arXiv.2405.15793.

**OpenHands EventLog architecture (cited from docs.openhands.dev):** The comparison to Lattice's decisions.log is apt. The distinction between per-Conversation EventLog and cross-session decisions.log is real and material. The deliverable's recommendation to add a per-cycle event log (03 §lesson 3) is consistent with OpenHands' architectural trajectory. The OpenHands microagent three-tier loading is correctly analyzed.

**mini-swe-agent 65% benchmark:** Cited from 03, attributed to "July 2025." The benchmark is the most uncomfortable data point in the survey and the deliverable handles it honestly (06 §F3, 03 §SWE-agent analysis). No citation hygiene issue; cited from GitHub source.

**Aider architect mode benchmark (~5-7 percentage points):** Cited from aider.chat/2024/09/26/architect.html. The benchmark claim is real (the aider.chat blog post is a primary source). The deliverable correctly extracts the underlying principle (split reasoning-from-editing).

**Missing literature:** Three areas are not covered that bear on the architecture claims:

1. **Software library extraction / vendoring patterns.** The Fork vs. Vendor vs. In-place scoring (05 §7) would benefit from citation to empirical work on library extraction and fork maintenance cost. Rosso & Palyart (2018) "A Study on the Use of Community Smells in Describing Software Projects" and Hora et al. (2021) studies on dependency breakage are relevant. No direct citation, and the "forks rot in 2 milestones" claim is uncited.

2. **Agent framework taxonomy literature.** Wang et al. (2024) "A Survey on Large Language Model based Autonomous Agents" (arXiv:2308.11432, DOI: 10.48550/arXiv.2308.11432) provides a taxonomy of agent components that maps onto Lattice's seven-piece taxonomy. The deliverable's comparables survey is extensive but would be strengthened by grounding the taxonomy in published frameworks rather than deriving it from Lattice's own README.

3. **Platform plugin API design and harness viability.** The "harness for a specific platform" problem has been studied in the IDE extension context (e.g., VS Code extension development patterns). Microsoft's "Extension API Principles" documentation and the Language Server Protocol design are relevant precedent for "harness-generic, platform-adapter-specific" architectures. Not cited.

**Citation hygiene (R1 standard mode):** The deliverable is a research document, not a peer-review output, so the Section 5 DOI/PMID citation requirement does not apply to the source documents themselves. The 03-comparable-frameworks.md source list does include URLs, which provides some auditability. The main gap is the uncited assertion about fork-rot timelines ("within 2 milestones").

---

## Section 6: Findings summary

### Finding F-1: The 76% harness-grade figure is projected, not current [CONDITIONAL]

**Text reference:** README executive summary §1 and 05 §8.3: "The harness pillar contains ~76% of today's Lattice."

**Evidence:** The 76% figure is computed over a "post-extraction bundle" that does not yet exist. Today's Lattice has 18 of 34 skills (53%) non-trivially SENDEX-coupled. The 76% is the fraction of a hypothetical carve-out set, with the carve-out set defined as "the subset that passes the coupling audit." This is internally consistent but the word "today's" in the README creates a misleading impression of the current state.

**What would fix it:** Restate as "the proposed harness-pillar carve-out (Option B) would be ~76% of Lattice by file count" and explicitly label the figure as projected.

### Finding F-2: The TOML contract does not close Defects 3, 5, 6, 7 [CONDITIONAL]

**Text reference:** 04 §5.3 coupling defect list and 08 §4 migration effort table.

**Evidence:** Defect 3 (SENDEX-specific knowledge filenames in skill prompt text), Defect 5 (module names in cycle classification prompt), Defect 6 (project-specific names in audit scripts), and Defect 7 (SENDEX-specific empirical-claim exemplar wording) cannot be resolved by TOML path indirection alone. They require skill prompt re-authoring. The deliverable classifies all 8 defects under the TOML contract's scope in 04 §6 ("changes in the harness with this contract"), creating a false impression that the TOML is sufficient.

**What would fix it:** Separate the defect fix map into two categories: (a) defects addressable by TOML indirection (1, 2, 4, 8); (b) defects requiring per-skill re-authoring (3, 5, 6, 7). Update the 08 §4 effort table to list skill-prompt re-authoring for the four path+domain-term defect classes as a distinct line item.

### Finding F-3: Skill-re-authoring drift has no proposed mechanism [CONDITIONAL]

**Text reference:** 07 §9 Q5 and 05 §9 Q1.

**Evidence:** The deliverable correctly identifies the drift problem (when harness-pillar skill SHAPE evolves, per-project copies need to track) but presents only three options (template substitution, sync script, accept drift) without selecting one. This is the architectural "hot potato" — the decision is deferred into the open-questions list rather than resolved in the recommendation.

**What would fix it:** 08-architecture-recommendation.md §5 (extraction strategy) should add a "skill version contract" mechanism — at minimum, a `[skills] harness_version` field in `lattice-project.toml` that the sync script validates, and a CHANGELOG entry in `lattice-core/` for any SHAPE-level change. This is a low-cost addition that makes drift detectable.

### Finding F-4: The comparables survey conflates "pattern absent" with "failure mode unmitigated" [CONDITIONAL]

**Text reference:** 03 cross-cutting §2 ("where Lattice has no precedent").

**Evidence:** The six "no precedent" claims (verdict-enum registry, two-round review with arbiter, algorithm-defensibility gate, four-layer authoritativeness ladder, concurrency hygiene, bug-retro enforcement) are stated as binary absences. But several of these failure modes ARE mitigated in other systems via different mechanisms:

- Verdict-enum registry: SWE-agent's action parser validates action shapes before dispatch — same class of error (malformed gate condition), different mechanism.
- Two-round review: OpenHands' inference-time scaling with critic model (November 2025) achieves "independently reviewed artifact" without the bikeshed-arbiter pattern. The deliverable notes this but classifies it as "partial" without acknowledging that "partial" might be sufficient mitigation.
- Concurrency hygiene: per-container isolation in SWE-agent and OpenHands achieves the same "no two sessions corrupt the same state" goal as Lattice's WIP locks, via architectural enforcement (container boundary) rather than file-based locks.

**What would fix it:** Reframe the "no precedent" claims as "no precedent for this specific implementation pattern" and add a note on equivalent-mitigation alternatives where they exist.

### Finding F-5: prepare-release.md placement lacks a worked non-DG example [CONDITIONAL]

**Text reference:** 07 §3 placement verdict and 07 §9 Q1.

**Evidence:** The placement-test verdict that `prepare-release.md` belongs in the harness pillar rests on the claim that the skill body is "entirely parameterizable via {{platform.publish.command}}." The deliverable itself raises the falsifiability question ("does it survive a code-review smell test?") but answers it by assertion rather than by providing a concrete non-DG substitution. For the placement to be defensible, the document should show what the skill body looks like for a finance plugin using a hypothetical `buildtool release --prod` command, confirming that the skill's prose context ("ensure all contract triangles are satisfied before publish," "verify CHANGELOG version matches package version") is still meaningful for that project.

**What would fix it:** Add a two-row comparison in 07 §3: DG substitution vs. non-DG substitution. If the non-DG version is natural, the harness-pillar placement is vindicated. If it reads awkward or empty, the platform-pack placement is correct.

### Finding F-6: Server-side Datagrok validation is a partial black box [SOUND — acknowledged]

**Text reference:** 01 §4.2 ("What the server validates at upload") and 01 §6 Q1.

**Evidence:** The deliverable correctly identifies that publish-time server-side validation is not fully visible from the public repo. The finding is flagged explicitly in 01 §4.2 and carried into the open-questions list. This is an honest scope acknowledgment, not a defect.

**Status:** SOUND — the gap is real, acknowledged, and appropriately flagged for resolution. No additional recommendation needed beyond what is in 01 §6 Q1.

### Finding F-7: The effort estimate (4-6 weeks) is missing its key assumption [CONDITIONAL]

**Text reference:** 08 §4 effort table and README §4.

**Evidence:** The "Total to first DG plugin port using the harness: ~4-6 weeks of focused work" figure omits two variables: (a) the re-authoring cost for the 17 path+domain-term skills is listed as "~1 day per 5 skills = 4 days" in 08 §4, but this assumes the DG project pillar is already authored (knowledge files, domain map, validation references, system manifest). Authoring the project pillar from scratch is not in the estimate. (b) The per-project re-authoring of 7 HEAVY skills is listed as "1-3 days each" which at the median of 2 days × 7 = 14 days = nearly 3 weeks alone for the HEAVY skills, yet the total is "4-6 weeks" including infrastructure work. The arithmetic does not close.

**What would fix it:** Add a "first DG plugin port" effort breakdown that separates: (i) harness infrastructure work (executor TOML loader, template substitution, library carve-out), (ii) platform pillar authoring (component map, API index, fact graph, sibling skill pack), (iii) project pillar authoring (knowledge files, system manifest, domain map), (iv) HEAVY skill re-authoring. The 4-6 week figure may be correct but the reader cannot verify it from the current presentation.

---

## Section 7: Verdict

**CONDITIONAL**

The deliverable is technically sound and internally consistent. The platform-agnostic claim is defensible with the proposed carve-out definition, and the coupling audit in 05 is the most rigorous part of the document — specific, file-level, with clear coupling-kind classifications. The comparable-frameworks survey (03) is well-executed and the field positioning of Lattice's specific patterns is accurate at the implementation level.

The deliverable is CONDITIONAL rather than SOUND on five counts:

1. **The 76% figure is presented as current state when it is projected state.** (F-1)
2. **The TOML contract is presented as closing all 8 coupling defects when it closes only 4.** (F-2)
3. **The skill re-authoring drift problem is surfaced but not resolved.** (F-3)
4. **The "no precedent" claims in the comparables survey conflate mechanism absence with mitigation absence.** (F-4)
5. **The 4-6 week effort estimate does not close arithmetically with the per-skill effort data in 08 §4.** (F-7)

None of these are blocking defects in the research itself — the findings and recommendations survive all five revisions. The conditions are presentational and scope-refinement fixes that would strengthen the deliverable before it drives implementation decisions.

**What would make this SOUND:** address F-1 through F-5 in a revision pass. The most important is F-3 (skill drift mechanism) because it is the only gap with no draft solution anywhere in the 9 files.

---

## Section 8: Competing hypotheses summary

| Dimension | Deliverable's claim | Alternative H1 | Alternative H2 | Status |
|---|---|---|---|---|
| Harness-grade fraction | ~76% of Lattice (post-carve-out) | ~47% if "harness-grade" means "works out of box without re-authoring" (clean + path-only = 5+7=12 of 28 lattice-prefix skills) | ~76% is accurate for the carve-out bundle as defined; the dispute is about what "harness-grade" communicates | CONDITIONAL — accurate per definition; misleading per implication |
| Extraction strategy | Vendor wins over fork on every dimension except short-term time | Fork wins at n=2 consumers over 12-month horizon due to lower overhead | In-place is sufficient if DG plugin development stays within Larisa's repo | CONDITIONAL — vendor correct at n=3+; uncertain at n=2 |
| Comparable-frameworks novelty | Lattice has no precedent for 6 specific patterns | OpenHands microagent + trained critic + container isolation collectively mitigate the same failure modes via different mechanisms | mini-swe-agent 65% at 100 LOC means the harness is adding ~11% of the 35% remaining failure gap at high infrastructure cost | CONDITIONAL — the specific implementations are novel; equivalent mitigations exist for some failure modes |
| prepare-release.md pillar | Harness pillar (parameterizable shape) | Platform pillar (hollow without DG values; practically identical to platform-pack skill) | Either; the placement only matters if non-DG consumers need it, which requires evidence of non-DG adopters | UNCERTAIN — requires worked non-DG example to resolve |

---

## Persist gaps

### Research gap

The skill-version-contract mechanism (how per-project re-authored HEAVY skills track harness-pillar SHAPE evolution) has no proposed solution. This is the architectural gap with the highest ongoing maintenance cost. Recommend investigation of: (a) template-at-authoring-time (skill body is a Jinja-style template expanded by sync-skills.sh); (b) structural test (harness ships a pytest/bash test that validates the section structure of any skill claiming to implement a given harness contract); (c) version-keyed skill schema (TOML key `[skills] review_schema_version = 3` that sync-skills.sh validates against the harness-shipped schema version).

Source: peer-review/dg-agentic-harness

### Data gap

The "4-6 weeks to first DG plugin port" estimate cannot be verified from the effort data in 08 §4 because the project-pillar authoring cost (knowledge files, system manifest, domain map) is not itemized. Authoring the DG project pillar is a one-time cost that depends on the DG team's existing documentation state — it could be 1 day (if the component map and API index are already authored as part of W1.A1/A2) or 2 weeks (if those documents need to be created). This gap should be resolved before the 4-6 week figure is used to commit resources.

Source: peer-review/dg-agentic-harness

---

*Review completed 2026-05-07. Full review on disk at `C:/pg/lattice/research/dg-harness/peer-reviews/dg-agentic-harness-review.md`.*
