# Corpus Coherence + Probe — dg-agentic-harness

> Step 6 (distill --audit) + Step 7 (probe) of the research-cycle. Both informational; Step 6 is non-blocking, Step 7 STOPs only on BREAKS or SCIENCE-FLAG.

---

## Step 5 — Evaluation

**R2 outcome:** 4 CONDITIONAL + 2 SOUND-acknowledged + 0 FLAWED.

**Decision per the research-cycle Step 5 evaluation table** ("All SOUND or CONDITIONAL → Validated — proceed autonomously to Step 6"): research validated. No persistent FLAWED, no FLAWED on previously-SOUND, no testable factual disputes that escalate. Auto-proceed.

R1 verdict was CONDITIONAL with 5 findings (all addressed in the incorporation pass per R2's R1 revision check section). R2 verdict is CONDITIONAL with 6 findings (4 incorporated this pass; 2 SOUND-acknowledged with one fixed and one logged as RG-DG-1 for follow-up). Net trajectory: each round closes the prior round's findings without re-raising them.

---

## Step 6 — Distill audit (corpus coherence)

The `lattice:distill --audit` step is normally scoped to the SENDEX domain corpus (`docs/_internal/knowledge/`, `docs/_internal/research/`). For this topic — harness-level meta-research at `C:/pg/lattice/research/dg-harness/` — coherence is checked against the existing Lattice prose corpus that the deliverable explicitly cites:

- `C:/pg/lattice/README.md` (especially "Worked translation: Datagrok plugin development" lines 283-297, "Three layers" lines 301-309, "Failure modes and mechanisms" lines 126-234)
- `C:/pg/lattice/docs/datagrok-harness-workplan.md` (the donation table, Path B workplan, 1-month gate criteria, three workstreams)
- `C:/pg/lattice/docs/harness-for-datagrok.md` (the generalization document — failure-mode patterns, cycle structure rationale, skills/roles/agents/teams disambiguation, five-level enforcement ladder)

### Coherence findings

| Existing claim | Deliverable claim | Coherent? | Notes |
|---|---|---|---|
| `harness-for-datagrok.md` §7 — "Layer 3 (Process) all transferable; Layer 1 (Platform) DG-specific; Layer 2 (Scientific) high-stakes-domain only" | `08-architecture-recommendation.md` §6 — "76% of Lattice ships as harness-pillar with the schema contract; 24% is non-trivially SENDEX-coupled, concentrated in 6 HEAVY + 1 fundamental skill" | YES | Deliverable refines the prose claim into a per-file inventory with concrete carve-out boundary. |
| `datagrok-harness-workplan.md:23-33` donation table — 8 assets domain-neutral, scientific layer not donatable | `05-lattice-extraction.md` §2-§6 per-file inventory; §8.3 survival count table | YES | The deliverable audits each donation against source. The donation table's "borrow heavily" framing for skills is refined: 22 of 34 skills are donatable as-is or with TOML+re-authoring; 7 stay project-side. |
| `README.md:285` "76+ reference packages" | `02-plugin-scaffolds.md` §3 — actual count is 74 | DELTA (minor) | Public repo verified: `ls -d C:/datagrok/public/packages/*/ → 74`. Flagged in the deliverable as a verified delta. Not load-bearing. |
| `README.md:286` "grok check validates package signatures, imports, package.json, changelog" | `01-platform-jsapi.md` §3 — 9 distinct checks enumerated; "no extension point today" | DELTA (extension) | The README understates the validator's scope. The deliverable verifies the 4 named checks AND adds 5 more (heavy-import linter, sourcemap presence, .npmignore hygiene, npm-name regex, datagrok-api deep-import block). Not a contradiction; the prior corpus was undercount. |
| `README.md:288` "Verdict-enum registry equivalent — None" (aspirational) | `01-platform-jsapi.md` §2.6 — 28 ship-installed `DG.SEMTYPE.*` values, `SemTypeInfo` shape | YES | The deliverable provides the empirical foundation for the W1.A2 platform-fact-graph deliverable named in the workplan. |
| `harness-for-datagrok.md` §3.3 — "Two rounds of peer review with bikeshed arbiter" | `03-comparable-frameworks.md` cross-cutting §2 — "no surveyed framework implements the bikeshed/persistent-FLAWED arbiters" | YES, refined | The deliverable refines this from categorical to specific-implementation-pattern after R1 F-4 fix. Equivalent mitigations (OpenHands trained critic, SWE-agent action parser) named explicitly. |
| `datagrok-harness-workplan.md:84` (W1.B4 candidate skill list) | `07-proposed-skills.md` §3 — placement test triages each candidate | YES | The deliverable validates the workplan's deferral rationale: 4 of 5 W1.B4 candidates land in the platform pack (DG-specific), 1 lands in the harness pillar (parameterizable). |
| `datagrok-harness-workplan.md:103-107` (Fork / Vendor / Inspire integration shapes) | `05-lattice-extraction.md` §7 (Fork / Vendor / In-place scoring) | YES, expanded | The deliverable adds In-place-as-prep-step + Vendor-as-destination sequencing; same conclusion (vendor wins) with explicit Phase 0 transitional state. |

**Verdict: no contradictions found.** The deliverable is additive to the existing Lattice corpus — refines prose claims into per-file inventories, fills empirical gaps the prior docs flagged as "to be authored" (component map, fact graph), and proposes concrete contracts (TOML manifests, skill-version contract) that the prior docs left as open questions. Two minor deltas (74 not 76 packages; 9 not 4 grok-check checks) are factual corrections, not contradictions.

**Corpus Integration:** the deliverable's recommendations should land alongside the existing `harness-for-datagrok.md` and `datagrok-harness-workplan.md` as a research-output addition. No retraction or revision of the existing docs is required. Specific cross-references the existing docs may want to add (informational, not blocking):

- `datagrok-harness-workplan.md` W1.B1 ("knowledge-graph query script") could cite `04-project-graph.md` §6.1 `[knowledge.query]` as the contract spec for that script.
- `datagrok-harness-workplan.md` W1.A1 (component map) could cite `01-platform-jsapi.md` §2 (class hierarchy + namespaces with file:line anchors) as the source-verified foundation.
- `harness-for-datagrok.md` §6 ("instructions ≠ behavior trap") could cite `07-proposed-skills.md` §4.6 (`audit-harness-pillar.py`) as the worked example of converting an aspirational rule into a mechanical hook.

---

## Step 7 — Probe (cross-system implications)

Per the cycle-state notes, probe is scoped to the harness/platform/project pillar boundary, not the SENDEX system manifest. The probe asks: does the recommended architecture have unintended consequences for any existing subsystem?

### Probe targets

| Subsystem | Implication | Verdict |
|---|---|---|
| SENDEX itself (`C:/pg/pcc/`) | Adopting the recommended carve-out requires SENDEX to depend on `lattice-core` rather than the current monorepo-style local dependency. SENDEX's existing 80+ cycle-state files, 35-skill consumers, all hooks, all TOML conventions continue working as-is during Phase 0 (in-place reorg) since paths don't change. Phase 1 (vendor library extraction) is the breaking transition — SENDEX's package.json (or equivalent) gains a `lattice-core` dependency declaration, and all skill paths that today resolve to `C:/pg/lattice/commands/lattice/` resolve to `node_modules/lattice-core/commands/` (or equivalent install path). One-time friction. | **PROPAGATES** — adoption requires migration; no breakage during Phase 0; Phase 1 is mechanical. |
| Existing SENDEX skill re-authorings (per pcc CLAUDE.md "Where Rules Live" — `.claude/rules/*.md`, `docs/_internal/checklists/*.md`) | The skill-version contract introduces `[skills.<name>] harness_version` declarations. SENDEX's existing `.claude/rules/` files are NOT re-authored skills; they are project-specific rule files that don't claim to implement a harness skill SHAPE. The contract applies only to the 7 HEAVY skills. SENDEX would author 7 TOML stanzas (one per HEAVY skill) at Phase 0 completion. | **PROPAGATES** — small migration; not breaking. |
| `audit-harness-pillar.py` against current Lattice | If run against today's Lattice (pre-extraction), the audit fails-loud — the harness contains 18 of 34 skills that are non-trivially SENDEX-coupled (per `05-lattice-extraction.md` §2.3). The deliverable explicitly assumes the audit runs against the post-extraction `lattice-core/`, NOT the current monorepo. Pre-extraction runs are expected to fail; that's the point. | **SAFE** — no breakage; design assumes post-extraction scope. |
| Deny-list update trigger ↔ platform SDK versioning (R2-F2 fix) | Ties `lattice-core` releases to platform SDK versioning — when DG ships a new SDK version with new public tokens, the deny-list must update before the next `lattice-core` release. SENDEX's adoption requires checking the deny-list at SDK upgrade. Coordination overhead between Datagrok platform team and Lattice maintainer. | **PROPAGATES** — coordination cadence between teams; not breakage. |
| Existing `pcc/.lattice/` state files | Cycle-state YAMLs, decisions.log, locks, review-gate.json — all schemas are harness-pillar today and remain harness-pillar post-extraction. No migration. | **SAFE** |
| Existing Lattice executor consumers (via `lattice` CLI in pcc) | The TOML loader is added to the executor at Phase 0. SENDEX without a `lattice-project.toml` falls back to the current SENDEX-shape defaults during a back-compat window (per `04-project-graph.md` §7 question 1 strawman: "required-with-shipped-template, with SENDEX's own template as the back-compat default"). | **SAFE** during back-compat; **PROPAGATES** when back-compat ends. |
| Comparable-frameworks claims (`03`) | The "no precedent for the specific composition" framing requires periodic re-validation as the field evolves. OpenHands and others ship at high cadence. | **STALE** (tracking) — not blocking, but the comparable-frameworks scan should be re-run on the next major Lattice release. Logged as a tracking item; not a probe stop. |

### Verdict: PROPAGATES (no BREAKS, no SCIENCE-FLAG)

The recommended architecture has consequences for SENDEX (one-time migration friction during Phase 1) and for the Datagrok platform team (coordination cadence on deny-list updates). Neither is a BREAK; both are accounted for in the deliverable's Phase 0/1/2 sequencing.

This is a non-algorithmic topic — no SCIENCE-FLAG applicable.

The comparable-frameworks claim is STALE-tracking (OpenHands and adjacent systems ship at high cadence; the scan from this deliverable will need refreshing). Not a probe stop; logged in the state file for the next major release.

**Decision: Research phase complete. No user escalation required.**

---

## Persistence summary

- **Cycle state:** `C:/pg/pcc/.lattice/cycle-state/dg-agentic-harness.yaml` — phase advanced to `research-complete`, current_step `build.0` per protocol.
- **Decisions log:** `C:/pg/pcc/.lattice/decisions.log` — entries for AUTO-START (Step 1), AUTO-INCORPORATE (Step 3), AUTO-COMPLETE (this step).
- **Topic lock:** `C:/pg/pcc/.lattice/cycle-lock/dg-agentic-harness/` — released at the end of Step 7b.
- **REGISTRY.md:** 3 research gaps logged by the R2 agent (RG-DG-1 paragraph-level semantic drift; RG-DG-2 deny-list spec — partially closed by R2-F2 fix; RG-DG-3 AutoCodeRover novel-source verification).
- **TODO.md:** 2 data gaps logged by the R2 agent — both marked RESOLVED in the R2 incorporation pass (shape-manifest cost gap closed by R2-F4 fix; deny-list specification gap closed by R2-F2 fix).
- **Deliverable:** 9 files at `C:/pg/lattice/research/dg-harness/` + 2 peer reviews (R1 + R2) + this notes file.

**Next:** the deliverable is ready for thread discussion. The natural follow-up is `lattice:blueprint-cycle dg-agentic-harness` IF the team decides to proceed with the recommended Phase 0 in-place reorg + Phase 1 vendor library carve-out. Until that decision lands, the research is the artifact.
