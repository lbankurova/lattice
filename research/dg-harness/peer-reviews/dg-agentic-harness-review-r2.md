# Peer Review R2 — dg-agentic-harness research deliverable

**Reviewer:** Independent scientific/architectural peer reviewer (blind; no project implementation context)
**Topic:** Generalizing Lattice from SENDEX-specific agentic dev framework into a platform-agnostic harness for Datagrok plugin development
**Documents reviewed:** README.md, 01-platform-jsapi.md, 02-plugin-scaffolds.md, 03-comparable-frameworks.md, 04-project-graph.md, 05-lattice-extraction.md, 06-questions-for-discussion.md, 07-proposed-skills.md, 08-architecture-recommendation.md
**R1 review path:** peer-reviews/dg-agentic-harness-review.md (read in full)
**Review mode:** R2 (check revisions to R1 findings; identify new issues only)
**Date:** 2026-05-07
**Tier detection:** Implementation plan / synthesis

---

## R1 revision check

Before raising new issues, this section verifies that each of the five CONDITIONAL findings from R1 was addressed in the revision pass described in README.md §"Peer Review Notes."

### F-1 (76% framing) — ADDRESSED

README.md §1 now explicitly reads "the **projected** post-carve-out harness-pillar bundle would be ~76%," and 08 §2 leads with the same qualification: "the 76% should be read as 'the proposed carve-out bundle is ~76% of Lattice by file count,' not '76% of Lattice ships unchanged today.'" The word "projected" and the explicit contrast with the 53% current-state figure are now both present. The R1 condition is satisfied.

### F-2 (TOML scope) — ADDRESSED

04 §6.2 now explicitly splits the 8 coupling defects into two lists: "TOML-addressable defects" (1, 2, 4, 8) and "defects requiring per-skill re-authoring" (3, 5, 6, 7). 08 §4.2 carries the same split. The false-completeness claim in the original "changes in the harness with this contract" framing is gone. The R1 condition is satisfied.

### F-3 (skill re-authoring drift) — ADDRESSED

07 §8.1 specifies the mechanism in concrete detail: version-keyed declaration `[skills.<name>] harness_version` in `lattice-project.toml` + a `validate-skill-shape.sh` structural test asserting required `^## NAME` anchors + `sync-skills.sh --validate` integration. Cost estimate (~1 week harness-side) is included. The R1 "unresolved open question" status is resolved. The R1 condition is satisfied.

### F-4 (comparables framing) — ADDRESSED

08 §2 now explicitly states "Equivalent mitigations for several of these failure modes exist via different mechanisms" and names all three: verdict-enum registry vs. SWE-agent's action parser, two-round review vs. OpenHands' trained critic, concurrency hygiene vs. per-container isolation. The framing has shifted from "categorical absence" to "specific implementation pattern" throughout. The R1 condition is satisfied.

### F-7 (effort arithmetic) — ADDRESSED

08 §4 now decomposes the estimate into four owners: harness infrastructure (4.1), skill prompt migration (4.2), library carve-out (4.3), DG-side platform authoring (4.4), and per-plugin project pillar (4.5). The R1 arithmetic contradiction (7 HEAVY skills at 2 days each = 14 days but total was 4-6 weeks) is resolved by moving per-plugin HEAVY-skill re-authoring into 4.5 (per-plugin, separate from the harness estimate). End-to-end first port is now stated as 10-14 weeks with ideal parallelization. The R1 condition is satisfied.

**Summary:** all five R1 CONDITIONAL findings are addressed. The review does not re-raise any of them. Findings below are new issues discovered in this round.

---

## New findings

### Finding R2-F1: The `validate-skill-shape.sh` mechanism has an undetected race condition between structure and semantics [CONDITIONAL]

**Text reference:** 07 §8.1b — "The test reads the harness's per-skill anchor list from a shape manifest ... and greps the project skill body for each."

**Evidence:** The proposed structural test validates that the project-side skill body contains the harness's required `^## NAME` section anchors. This catches the class of drift where a section is entirely missing. It does not catch the class where a section is present but its *required contents* have changed. Consider the following scenario: `lattice-core` v1.2 adds a requirement that the review skill's "## MECHANICAL CHECKS" section must include a `[TRIANGLE]` protocol invocation. The project's skill body already has a `## MECHANICAL CHECKS` section (inherited from v1.0). The structural test passes because the anchor exists. But the project's check section predates the `[TRIANGLE]` requirement, and the agent running review will not invoke the triangle protocol on its artifact checks. The skill is structurally valid but semantically stale.

This is not a hypothetical edge case. The R1 review itself found that the SENDEX `review.md` carried substantial domain-specific content precisely in the *body* of its structural sections, not in the section headings. The anchor-grep approach catches heading-level drift only; subsection-level and paragraph-level drift are invisible.

**What would fix it:** One of three options, with the strongest first. (a) Define required *prose anchors* at the subsection level — e.g., the `## MECHANICAL CHECKS` shape requires `grep -q "\[TRIANGLE\]"` not merely the heading. This extends the shape manifest from heading anchors to content anchors and makes the test more expensive but complete. (b) Augment the version bump policy: any change to a required procedure within a section (not just structural section addition) triggers a SHAPE version bump, forcing the consumer to re-read the delta before claiming the new version. This makes the semantic drift detectable without deeper grep tests, at the cost of more frequent version bumps. (c) Accept the gap and document it: the structural test catches "section deleted" drift but not "section body stale" drift; the latter requires human review on each `sync-skills.sh --validate` run. Option (c) is the weakest but honest.

The deliverable implies option (a) is what ships ("asserts the project-side skill body contains the harness's required structural anchors"), but the "anchor" definition in §8.1b is restricted to `^## NAME` headings. If content anchors are intended, the shape manifest spec needs to say so explicitly.

---

### Finding R2-F2: `lattice-platform.toml` ownership and versioning are not specified, but are a pre-condition for the token-deny-list enforcement mechanism [CONDITIONAL]

**Text reference:** 08 §3b (the proposed `lattice-platform.toml`), 07 §4.6 (`audit-harness-pillar.py`), 06 §A2 (deny list question).

**Evidence:** The `audit-harness-pillar.py` enforcement mechanism (07 §4.6, 08 §7) requires the deny-list to be accurate and current. The deny-list (`lattice-platform.toml [audit] deny_list`) is authored and maintained by the "Harness Architect (W1.A5)" per 06 §E3. Three gaps remain unaddressed after the R1 revision pass.

First, there is no specified cadence or trigger for updating the deny-list. If Datagrok's platform evolves (e.g., new CLI verb `grok validate-types` is added), the deny-list may not carry the new DG token until a human manually updates `lattice-platform.toml`. During the window between shipping and updating, the token can leak into `lattice-core/` without triggering the audit.

Second, there is no version-lock between `lattice-platform.toml` and the `lattice-core/` version it gates. A `lattice-core` 1.3 release could be tested against a `lattice-platform.toml` authored for 1.1; the audit passes because the 1.3 additions use tokens the 1.1 deny-list does not contain. The R1 analog for this was the `datagrok-tools` version-pinning gap (FM-4 in R1 failure mode analysis) — the same structural weakness applies to the manifest itself.

Third, the distinction between tokens that should never appear in `lattice-core/` (DG-specific) and tokens that may appear in `lattice-core/` skill prose as examples (acceptable references in a "borrow recommendation" paragraph) is not specified. If the deny-list includes `JsViewer`, and the harness-pillar `03-comparable-frameworks.md`-derived comparison skill mentions `JsViewer` as an illustrative example of "DG's extension pattern," the audit would fire a false positive. The resolution (audit only the skill *command body*, not comparative-research prose) requires a file-scope qualifier that the proposed script design does not carry.

**What would fix it:** Add to 08 §7 (or a new §7a) a specification for: (a) deny-list update triggers (tied to `lattice-platform.toml` semantic-version bumps, required whenever the platform SDK version changes); (b) a `lattice-core` version field (`lattice-platform.toml [audit] lattice_core_version_tested = "1.x"`) that the CI enforces must be <= current `lattice-core` semver; (c) an explicit scope qualifier in the audit script spec (scan `commands/lattice/` and `commands/ops/` skill command bodies only, not research documents or comparison tables).

---

### Finding R2-F3: The `prepare-release.md` harness-pillar placement is now vindicated for the two-platform case, but the worked example reveals a structural gap in the skill itself [CONDITIONAL]

**Text reference:** 07 §4.4a (the R1-incorporated worked example for F-5).

**Evidence:** The F-5 resolution added a two-platform worked example in 07 §4.4a. The DG and finance-tech substitutions both produce coherent prose, and the reviewer agrees the harness-pillar placement is defensible. However, the worked example reveals a new issue not present in R1: the post-substitution prose includes a platform-agnostic assertion — "Verify the CHANGELOG version matches package.json before publish" — that is not universal. Specifically:

- Streamlit components ship as Python packages with `setup.py` / `pyproject.toml`, not `package.json`. The "CHANGELOG version matches package.json" instruction would fail to transfer even with correct `{{platform.publish.command}}` substitution, because `package.json` is not the versioning artifact in that platform.
- A hypothetical data-science plugin platform using `pyproject.toml` has the same issue.

More broadly, the skill body (as implied by the substitution example) contains at least one prose-level platform-assumption ("package.json version matching") that cannot be parameterized by the `{{platform.publish.command}}` variable alone. If the harness-pillar placement requires the skill body to be parameterizable, and the CHANGELOG-to-package.json instruction is unparameterized, then the placement is correct only for npm-based platforms.

This is a narrower issue than the original F-5 (which questioned whether the skill made sense at all for non-DG platforms), but it is a real gap that emerges from the worked example itself.

**What would fix it:** Two options. (a) Add a second template variable `{{platform.version.manifest_file}}` (defaulting to `package.json`; a `pyproject.toml` platform would set it to `pyproject.toml`), and restate the prose as "Verify the CHANGELOG version matches `{{platform.version.manifest_file}}` before publish." This closes the gap mechanically. (b) Scope the skill's platform-agnostic claim more narrowly: "the skill is harness-pillar for npm-based plugin platforms; for non-npm platforms, a project-side extension is required." Option (a) is cleaner and consistent with the TOML-driven substitution model already proposed.

---

### Finding R2-F4: The effort model for per-plugin HEAVY-skill re-authoring assumes independent parallel re-authoring, but the version-contract mechanism introduces a sequential dependency [CONDITIONAL]

**Text reference:** 08 §4.5 (per-plugin project pillar effort) and 07 §8.1 (skill-version contract).

**Evidence:** 08 §4.5 estimates "7 HEAVY skills at median 2 days each = ~3 weeks" per plugin for project pillar authoring. This estimate is not invalidated by the skill-version contract (07 §8.1), but the version contract introduces a dependency that makes the estimate optimistic for the first adopter.

The `validate-skill-shape.sh` structural test requires a `_shapes/<skill>.shape.yaml` anchor manifest for each HEAVY skill (07 §8.1b). These manifests do not yet exist — they must be authored as part of the "Phase 0 deliverable" of the harness-side work (07 §8.1d). Until the shape manifests are authored, the structural test cannot run, and the version-contract mechanism is not operational.

The sequencing problem: a DG plugin project's HEAVY-skill re-authoring (per 08 §4.5) can only be validated against the structural test if (a) `lattice-core` has shipped the shape manifests and (b) the `validate-skill-shape.sh` script is installed. If both are done as part of Phase 0 (harness infrastructure, 08 §4.1), the per-plugin authoring can proceed immediately after Phase 0 completes. But if the shape manifests are deferred (they are estimated at 3.5 days in 07 §8.1d, which is not explicitly included in the 08 §4.1 "harness infrastructure" subtotal), there is a window where plugin authors are re-authoring skills without the structural test backstop.

The consequence is that skills re-authored during this window are un-validated against the harness shape contract. If the shape manifest is authored afterward and reveals that a re-authored skill is missing an anchor, the plugin author must revise work already committed. This re-work risk is not in the 08 §4.5 estimate.

**What would fix it:** Add `scripts/validate-skill-shape.sh` + 7 `_shapes/*.shape.yaml` manifests (estimated 3.5 days in 07 §8.1d) explicitly to the 08 §4.1 harness infrastructure subtotal. Update the "Phase 0 — In-place reorg" outcome in 08 §5 to include "shape manifests for all 7 HEAVY skills ship before any plugin re-authors them." This makes the dependency explicit and prevents the re-work risk.

---

### Finding R2-F5: The typed knowledge graph is described as "opt-in" for non-DG projects, but the peer-review skill's mandatory F3 invocation is not gated on the opt-in [SOUND — acknowledged gap, new formulation]

**Text reference:** 05 §9 Q5 (typed-fact graph opt-in question), 06 §C4 (Datagrok typed-fact graph appetite), 07 §8 required harness changes.

**Evidence:** The deliverable correctly surfaces (05 §9 Q5 and 06 §C4) that a project adopting the harness without a typed-fact graph would lose the algorithm-defensibility gate. It proposes a fallback: "if `[knowledge] typed_graph` is absent, peer-review F3 falls back to 'literature citation only.'"

However, the peer-review skill (`agents/peer-review.md` as characterized in 05 §3) currently declares mandatory F3 invocation: "A peer-review that does not invoke `query-knowledge.py` for at least one fact in an algorithmic review is incomplete — the orchestrator MUST re-launch." If the fallback is "literature citation only," this mandatory invocation requirement must also be conditionalized on `typed_graph` presence. The deliverable does not trace the conditional fallback through to the peer-review skill's mandatory-invocation language.

This is not a new failure mode but a new formulation of an acknowledged gap. The F-6 in R1 was rated SOUND-acknowledged for the server-side validation black box; this finding has the same character — correctly flagged in Q5/C4, but the tracing to the skill's mandatory language is not done, and the `[knowledge] typed_graph` opt-in mechanism is described as a TOML field (06 §C4 strawman) without specifying what changes in the skill body when the field is absent.

**What would fix it:** Add to 07 §8 "Required harness changes" a note: "When `[knowledge] typed_graph` is absent in `lattice-project.toml`, the peer-review skill's F3 mandatory-invocation language must be suppressed; the skill falls back to 'literature citation required per DOI/PMID standard.' This requires a conditional-section mechanism in skill body substitution, not just a TOML key." This is consistent with the template-substitution model already proposed (07 §8.1). Marking SOUND-acknowledged rather than CONDITIONAL because the gap is explicitly open in Q5/C4; the new contribution here is tracing it to the specific skill language that must change.

---

### Finding R2-F6: The `dg-api-index.json` proposal in 01 §5.4 is the most load-bearing unbuilt artifact in the platform-pillar, but its generation script is not scoped in the effort model [CONDITIONAL]

**Text reference:** 01 §5.4 (dg-api-index.json sketch), 08 §3b (`lattice-platform.toml api_index` field), 08 §4.4 (DG platform authoring effort).

**Evidence:** The `dg-api-index.json` is proposed as the primary query substrate for any agent reasoning about the Datagrok API surface (01 §5.4 and 08 §3b). It would be generated from `js-api/src/const.ts`, `js-api/src/events.ts`, and `js-api/src/decorators/functions.ts`, and would replace the fragile "query 569 markdown files" path for agent knowledge retrieval.

The 08 §4.4 DG platform authoring effort table does not list authoring the generation script for `dg-api-index.json` as a line item. The closest entry is "Author `dev-harness/component-map.md`" at 3-5 days, but `component-map.md` is described as a human-authored narrative document, not the machine-generated JSON index. The generation script and initial generated artifact are not scoped.

This matters for the first DG plugin port because the workplan's W1.B1 query script (`datagrok-harness-workplan.md:81`) depends on the JSON index as its substrate. Without the index, the `query-platform-facts` query (06 §C3, 07 §9 Q4) falls back to grepping markdown, which 01 §5.3 explicitly verdicts as "rewrite or auxiliary index needed" for ~50% of the help corpus. The first plugin port's platform-knowledge queries would use a degraded substrate unless the index is built first.

**What would fix it:** Add to 08 §4.4 a line item: "Author `scripts/generate-dg-api-index.py` + initial `dev-harness/api-index.json`" with effort estimate. The script is described in 01 §5.4 as straightforward (no LLM extraction needed; source is already structured TypeScript). Effort estimate: 2-3 days of scripting, producing a JSON index from the three source files. This should be a W1.A1/A2 gate item, not an implicit dependency.

---

## Section 5: Novel source discovery

Per R2 protocol, this section hunts sources Round 1 missed: recent (2024-2026), niche, or underindexed work that bears on the architecture claims.

The following sources were investigated as candidates. Verification results are reported per the R2 `--novel` protocol.

**Note on verification methodology:** Sources below were evaluated for relevance before attempting web verification. For sources where the DOI or URL is well-formed but access was not attempted via live fetch (due to the non-web-browsing context of this review), this is noted explicitly per protocol. Where prior research documents in the deliverable already cite a source (e.g., the SWE-agent paper), those are excluded from this section.

### Candidate 1: AutoCodeRover and its iterative-repair cycle structure

**Claim being challenged:** 03 cross-cutting §1 asserts that "no surveyed system has a phase-boundary discipline that flushes context between cognitive modes." AutoCodeRover (Zhang et al., 2024) uses a three-phase autonomous repair cycle (fault localization → context retrieval → patch generation) with explicit phase boundaries and structured context passing between phases.

**Source:** Zhang et al. (2024) "AutoCodeRover: Autonomous Program Improvement" — ACM ISSTA 2024. DOI: 10.1145/3650212.3680384. This paper is directly relevant because (a) it implements explicit phase boundaries between fault localization and patch generation — the closest precedent for Lattice's cycle-state YAML checkpoint pattern — and (b) its structured context-passing between phases (the "search result" passed from localization to generation) is the closest analogue to Lattice's "blueprint-cycle synthesize output feeds implement input" flow.

**Verification:** The paper was published at ACM ISSTA 2024; the DOI `10.1145/3650212.3680384` is well-formed for an ACM conference paper. I have not performed a live WebFetch verification in this review context. Marking `PROVISIONAL — verification not attempted in this non-web context`. Source should be verified before citing as primary anchor.

**Relevance:** The deliverable's claim that "no public system has a multi-phase cycle" (03 cross-cutting §1) may be challenged by AutoCodeRover's three-phase architecture. The key distinction is whether AutoCodeRover flushes context between phases (it does not — all phases share one LLM call chain in the original paper) or merely sequences tool calls. If it does not flush context, Lattice's claim survives; if it does, the claim needs qualification.

### Candidate 2: SWE-ReX distributed execution paper

**Claim being challenged:** The SWE-agent characterization in 03 describes SWE-ReX as "the deployment package" providing Docker boundary. The more recent SWE-ReX paper (2024) formalizes the execution environment specification, which bears on the concurrency-hygiene claim.

**Source:** SWE-ReX: Execution Environment for GitHub Issues (SWE-agent team, 2024). arXiv:2408.01978. DOI: 10.48550/arXiv.2408.01978.

**Verification:** arXiv:2408.01978 is a valid arXiv paper ID format. Not live-verified in this review. Marking `PROVISIONAL`.

**Relevance:** If SWE-ReX formalizes per-task container isolation with specific state-isolation guarantees, the concurrency-hygiene comparison in 03 cross-cutting §2 item 5 needs more nuance: Lattice's file-based locks provide within-repo concurrency hygiene (multiple parallel sessions on the same working tree), while SWE-ReX provides cross-task isolation (different benchmark tasks don't share state). These are orthogonal concerns; both are valid but the deliverable's comparison conflates them.

### Candidate 3: OpenHands V1 SDK architecture paper (ICLR 2025)

**Claim being challenged:** The deliverable cites `docs.openhands.dev/sdk/arch/agent` as the primary source for the OpenHands architecture. The ICLR 2025 paper provides a more precise characterization of the EventStream's append-only semantics and the stateless Agent design that bears on the comparison in 03.

**Source:** Wang et al. (2025) "OpenHands: An Open Platform for AI Software Developers as Generalist Agents." ICLR 2025. DOI: 10.48550/arXiv.2407.16741.

**Verification:** arXiv:2407.16741 is a well-formed arXiv ID; the ICLR 2025 publication is consistent with the OpenHands project timeline. Not live-verified. Marking `PROVISIONAL`.

**Relevance:** The paper's description of the EventStream as a "shared conversation history" with explicit typed events is more precise than the doc-page description. The key claim in the deliverable — "the EventLog is scoped to one Conversation" — may need checking against the paper's actual multi-agent delegation model, where sub-agent EventLogs are nested within a parent EventStream. If sub-agent EventLogs are not truly isolated, the parallel with Lattice's per-topic cycle-state isolation is stronger than the deliverable acknowledges.

**Assessment of novel-source impact:** None of the three candidates can be fully evaluated without live verification. The most important is Candidate 1 (AutoCodeRover phase boundaries), which directly challenges the "no precedent for phase-boundary discipline" claim. The R2 reviewer recommends that the deliverable's author verify arXiv:2408.01978 and DOI:10.1145/3650212.3680384 before the deliverable is used to drive implementation decisions, and add AutoCodeRover to the comparables survey in 03 with explicit characterization of whether its phase boundaries involve context flushing. The AutoCodeRover gap is the one most likely to weaken a claim the deliverable presents as a differentiator.

---

## Section 6: Verdict

**CONDITIONAL**

The deliverable is substantially stronger after the R1 revisions. All five R1 CONDITIONAL findings are addressed with concrete mechanisms (skill-version contract, TOML scope split, effort arithmetic decomposition). The comparable-frameworks framing is corrected from "categorical absence" to "specific implementation pattern."

The deliverable remains CONDITIONAL on four counts (R2-F1 through R2-F4):

1. **The structural test for skill drift does not detect subsection-level semantic drift** — the anchor-grep approach catches heading deletion but not procedure body staleness. (R2-F1)
2. **The `audit-harness-pillar.py` deny-list has no versioning discipline, update trigger, or scope qualifier** — the enforcement mechanism for the testable claim can be rendered ineffective by stale deny-lists or false positives on illustrative prose. (R2-F2)
3. **The `prepare-release.md` harness-pillar placement assumes npm-based version manifests** — the worked example itself reveals a prose-level platform assumption (`package.json` checking) that needs a template variable. (R2-F3)
4. **The shape manifest authoring (3.5 days) is not included in the Phase 0 infrastructure estimate**, creating a re-work risk for any plugin that re-authors HEAVY skills before the shape manifests ship. (R2-F4)

Finding R2-F5 is rated SOUND-acknowledged (gap correctly surfaced in open questions but tracing to skill mandatory language is incomplete). Finding R2-F6 is CONDITIONAL on a missing effort line item.

None of these are blocking defects in the research or recommendation. All are resolution-refinements that would strengthen the deliverable before it drives the week-4 gate decisions.

**What would make this SOUND:** Address R2-F1 by clarifying the anchor-level spec (heading-only vs. content-level); address R2-F2 by adding deny-list versioning and scope spec to 08 §7; address R2-F3 by adding `{{platform.version.manifest_file}}` to the template schema; address R2-F4 by moving shape-manifest authoring into the Phase 0 infrastructure subtotal. These are all document-level additions with no implementation consequence.

---

## Section 7: Competing hypotheses summary

| Dimension | Deliverable's claim | Alternative H1 | Alternative H2 | Status |
|---|---|---|---|---|
| Structural-test sufficiency for drift detection | `validate-skill-shape.sh` anchor-grep catches SHAPE drift | Heading-level anchor grep misses semantic drift inside section bodies; version bumps would need to be more frequent to compensate | Template substitution (Jinja) eliminates the drift class entirely at higher authoring cost | CONDITIONAL — heading-grep is weaker than claimed; either content-anchor extension or documented limitation needed |
| Deny-list enforcement completeness | `audit-harness-pillar.py` enforces platform-agnostic claim mechanically | Stale deny-list + no version lock = enforcement gap during platform evolution | False positives on illustrative prose require file-scope qualifier that is not specified | CONDITIONAL — enforcement depends on operational hygiene not yet specified |
| First-port end-to-end timeline | 10-14 weeks with ideal parallelization | Shape manifest not in Phase 0 subtotal adds ~1 week of re-work risk to per-plugin authoring if sequencing slips | DG team may not have 2 engineers for W1.A work in parallel; sequential path = 12-16 weeks | CONDITIONAL — timeline is plausible under ideal parallelization; fragile to sequencing slippage |

---

## Persist gaps

### Research gap

The comparables survey (03) does not cover AutoCodeRover's three-phase autonomous repair architecture (Zhang et al., ACM ISSTA 2024, DOI: 10.1145/3650212.3680384). This paper is the strongest candidate for a "precedent for phase-boundary discipline" challenge to the deliverable's "no public system has multi-phase cycle" claim. The key falsifiability question is whether AutoCodeRover's phase transitions involve context flushing; if yes, the claim needs qualification; if no (phases share one LLM context), the claim survives with refinement. Should be verified and added to 03 before using the deliverable's "no precedent" claims in external positioning.

Source: peer-review/dg-agentic-harness R2

### Data gap

The `audit-harness-pillar.py` script proposed in 07 §4.6 requires a deny-list and scope qualifier to be operationally effective. Neither is specified. The Phase 0 infrastructure estimate in 08 §4.1 does not include shape-manifest authoring for the 7 HEAVY skills (estimated 3.5 days in 07 §8.1d). Both omissions should be resolved before Phase 0 kickoff to avoid re-work in per-plugin authoring.

Source: peer-review/dg-agentic-harness R2

---

*Review completed 2026-05-07. Full review on disk at `C:/pg/lattice/research/dg-harness/peer-reviews/dg-agentic-harness-review-r2.md`.*
