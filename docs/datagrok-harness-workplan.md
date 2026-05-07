# Datagrok Dev Harness — Workplan

> **Status:** kickoff doc. **Decision:** Path B (build the harness). **Milestone gate:** meaningful progress within 1 month or Path A (independent SENDEX port) starts.

## Two problems, distinct stakeholders

| | Problem 1 — Datagrok harness | Problem 2 — SENDEX port |
|---|---|---|
| **What** | A harness for agent-driven development on the Datagrok platform. Provides the discipline, knowledge layer, and tooling that lets agents build plugins, extend the core, and assist core developers. | Get SENDEX (pre-clinical study explorer) onto Datagrok as a plugin. The sister app (clinical data analysis) will hit the same wall. |
| **Who benefits** | Datagrok core team, all plugin authors (76+), external contributors, future plugin authors. | Larisa today; SENDEX users; downstream sister apps. |
| **Status today** | Doesn't exist. Plugin authors reverse-engineer conventions from source-reading. | Blocked on Problem 1, OR portable from outside the platform via the existing inefficient flow. |
| **Owner** | Datagrok (the company). | Larisa. |
| **Scale** | Capability investment for the platform. | One plugin. |

These problems share a forcing function (SENDEX needs to ship), but they are not the same project. Solving Problem 1 well solves Problem 2 cleanly *and* makes every future plugin cheaper. Skipping Problem 1 leaves Problem 2 portable but throws the same wall in front of the next plugin.

## Lattice's role

Lattice is **not** the Datagrok harness. Lattice is a harness for greenfield scientific apps, designed and tested over four months on SENDEX by a single non-developer. It works for that. Many of its ideas are useful for the broader Datagrok problem; some are SENDEX-shaped and should be left behind.

**What Lattice can donate to Problem 1** — Datagrok decides what to take, what to adapt, what to ignore:

| Donation | What it is | Maturity | Datagrok-applicable? |
|---|---|---|---|
| **Failure-mode catalog** | Nine documented LLM failure modes with mechanical fixes (self-review, context rot, drift under load, fabrication, concurrency, etc.) | Production-tested over 4 months | Yes — domain-neutral |
| **Cycle structure** | Research → Blueprint → Build, plus spike, bug-fix, mechanical-fix variants | Production | Yes, with adaptations |
| **Sub-agent protocol** | Independent reviewer agents (peer-review, architect, decision-audit, post-impl) with two-round limit, bikeshed arbiter, persistent-FLAWED arbiter | Production | Yes — domain-neutral |
| **Attestation format** | SIMPLIFY-1 unified `attestations[]` with rationale-quality validation | Production | Yes — domain-neutral |
| **Verdict-enum registry pattern** | Typed verdicts validated at workflow-load time | Production | Yes — same shape needed for any agent harness |
| **Typed knowledge-graph pattern** | Atomic facts (value/scope/derives_from/contradicts) queryable by agents | Production for SENDEX's domain; pattern is portable | Yes — Datagrok needs a platform-fact graph in this shape |
| **Hook + lock + state-write discipline** | Pre-commit, PreToolUse, locks, CAS-style state writes | Production | Yes — domain-neutral |
| **Workflow YAML executor** | TypeScript DAG engine running platform-neutral workflow definitions | Production | Maybe — Datagrok may want a different shape |
| **Lattice's scientific layer** | Algorithm-defensibility gate, validation ratchet, NOAEL-shape methods knowledge | SENDEX-specific | No — pilot-plugin-side only, not platform |

The Datagrok harness might:
- **Borrow heavily** (fork or vendor Lattice, adapt the spine, swap knowledge layers)
- **Borrow selectively** (take patterns; build parallel)
- **Ignore Lattice** (build from scratch using Lattice as an inspiration reference)

Per-item adoption decisions belong in W2 below.

## The decision: Path B with a 1-month gate

Path B is the chosen path. The team starts the harness work. SENDEX porting either parallels the harness work or waits.

**The 1-month milestone gate is a hard checkpoint.** At week 4 from kickoff, the team must show meaningful progress (criteria below). If the gate fails, Path A activates: Larisa starts independent porting, Datagrok continues harness work at whatever pace, and SENDEX gets re-aligned to the harness later (with extra rework cost).

**Acceptance criteria for "meaningful progress" at week 4:**

| Item | Bar |
|------|-----|
| Owners assigned | Every workstream item in W1 has a named owner. No "TBD." |
| Component map (W1.A1) | At least 10 entries authored by the Datagrok team, in a published location, with file:line anchors |
| Platform fact graph (W1.A2) | At least 15 typed facts, in the proper schema (`value`, `scope`, `derives_from`, `confidence`) |
| Lattice-adoption decision (W2.shape) | Per-donation table filled out: take / adapt / build-parallel / ignore. Documented. |
| Harness wiring proof-of-life (W1.B1, W1.B2) | A new plugin can be scaffolded, runs `grok check`, and produces a passing review-gate file. Doesn't have to be polished. Has to exist. |
| Phase 2 plan | Concrete dates for Phase 2 deliverables. Not "soon." |

If 5/6 are met at week 4, gate passes. 4/6: discuss; trend matters more than count. 3/6 or fewer: Path A activates.

This bar is intentionally concrete. Larisa's cutoff exists because past harness-style efforts on platforms-without-incentive-alignment tend to die in meetings. The gate forces the team to demonstrate work, not intention.

---

## Workstreams

Three workstreams. W1 is the project. W2 is advisory. W3 is independent.

### W1 — Datagrok harness (Datagrok team owns; the project)

The actual work: build a harness for agent-driven development on Datagrok. Beneficiaries: all plugin authors and core developers.

Items only the Datagrok team can author. Plugin authors can stub locally, but stubs drift the moment the platform evolves and proliferate inconsistently across plugins.

| ID | Item | Deliverable | Effort | 1-month gate? |
|----|------|-------------|--------|---------------|
| **A1** | Component / API map (v0.1) | `dev-harness/component-map.md` — for the 15-20 most-used patterns (DataFrame construction, view registration, viewer registration, dialog, menu, grid, property descriptors, file upload, function registration, etc.), the canonical class + file:line anchor in `js-api/src/`. Confidence-tagged. | 3-5 days for v0.1; ongoing | YES — ≥10 entries by week 4 |
| **A2** | Typed platform-fact graph (seed) | `dev-harness/platform-facts.md` — typed YAML facts (`value`, `scope`, `derives_from`, `confidence`, `contradicts`) for 30-50 platform invariants: semver rules, runtime version support, dataframe column-type semantics, viewer-event lifecycle, package-metadata roles, `DG.SEMTYPE.*` obligations. | 5-7 days for seed; grows organically | YES — ≥15 typed facts by week 4 |
| **A3** | `grok check` extensions | New checks behind `grok check --strict`: reuse-anchor enforcement, `.g.ts` edit detection, contract-triangle drift across releases. | 3-5 days | No — Phase 3 |
| **A4** | Publish-time CI hooks | Server-side gates on the central package server: contract-triangle audit, viewer-event compatibility, semver-conformance check. | 5-10 days; depends on A3 + A2 | No — Phase 3 |
| **B1** | Knowledge-graph query script | Adapted from Lattice's `query-knowledge.py` (or built fresh). Queries platform-fact graph (A2) and any plugin-local domain graph. `--source platform\|domain\|all` flag. | 0.5 day | YES — proof-of-life by week 4 |
| **B2** | Cycle workflows wrapping `grok` CLI | Build-cycle wraps `grok api` + `grok check` + `webpack` + `grok publish`. E2E gate uses `grok test --host localhost`. Spike-cycle adapts similarly. | 1 day | YES — at least build-cycle by week 4 |
| **B3** | Project scaffold for new plugin | `scaffold/datagrok-plugin/` — directory template producing a working empty plugin in ~5 minutes. | 1-2 days | Partial OK by week 4 |
| **B4** | Datagrok skill prompts | `commands/datagrok/{create-package, add-viewer, add-function, wire-detector, prepare-release}.md`. **Defer until W3.C1 reveals the actual workflow** — authoring skills before observing the work produces wrong skills. | 2-3 days; AFTER W3.C1 | No — Phase 2 |
| **B5** | Hook adaptations | Pre-commit step: `grok check` (BLOCKS). Pre-commit step: contract-triangle drift (BLOCKS, depends on A3). Claude Code PreToolUse on `Bash(grok publish*)`. | 0.5-1 day | Partial OK by week 4 |
| **A5** | Governance decision | Document: who owns the harness long-term? What's the release cadence? How does it version with Datagrok core? Where does the repo live (`datagrok-ai/dev-harness`)? | 1 day; needs team discussion | YES — owners assigned by week 4 |

### W2 — Lattice donation table (advisory; per-item adoption decision)

For each Lattice donation listed in "Lattice's role" above, the Datagrok team makes a decision:

| Donation | Adoption decision | Rationale |
|---|---|---|
| Failure-mode catalog | take / adapt / ignore | |
| Cycle structure | take / adapt / ignore | |
| Sub-agent protocol | take / adapt / ignore | |
| Attestation format | take / adapt / ignore | |
| Verdict-enum registry pattern | take / adapt / ignore | |
| Typed knowledge-graph pattern | take / adapt / ignore | |
| Hook + lock + state-write discipline | take / adapt / ignore | |
| Workflow YAML executor | take / adapt / ignore | |

**Three integration shapes the team picks among at A5:**

- **Fork.** Datagrok forks Lattice into `datagrok-ai/dev-harness`, evolves it independently. Larisa needs a merge cadence to stay current.
- **Vendor.** Datagrok depends on Lattice as upstream (or carves out a Lattice-core lib). Single source of truth for the shared bits.
- **Inspire.** Datagrok builds parallel using Lattice patterns but no shared code. Most ongoing duplication; cleanest separation.

Larisa is available to walk the team through any donation in detail and to advise during adaptation. Larisa is *not* assumed to do the integration work — that's W1, owned by Datagrok.

### W3 — SENDEX port (Larisa owns; parallel timeline)

The forcing function. SENDEX must become a Datagrok plugin one way or another. Independent of the harness work; sequencing depends on W1 progress.

| ID | Item | Deliverable | Effort | When |
|----|------|-------------|--------|------|
| **C1** | Spike: port one view | Pick the simplest SENDEX view. Port to Datagrok using whatever the harness has at that moment. Measure friction; produce friction log. | 2-3 days | Triggered when W1.B1+B2 are usable, OR at week 4 if Path A activates |
| **C2** | Full SENDEX port plan | View-by-view sequencing. Identify which views need new W1.A1 entries and which need new W1.A2 facts (feedback). | 1 day | After C1 |
| **C3** | Iterative port — phase 1 | Port views the harness already supports cleanly. Surface friction in batches; feed back to W1 weekly. | 2-4 weeks | After C2 |
| **C4** | Friction log | Living doc. Every harness gap encountered during the port → entry. Becomes the input to W1.A1/A2 iterations. | continuous | from C1 onward |
| **C5** | Iterative port — phase 2 | Port the remaining views once W1.A1/A2 v0.2 has landed. | 2-4 weeks | After W1 v0.2 |

If the 1-month gate fails: C1-C3 proceed without W1's harness. Larisa carries the port forward via the existing inefficient flow. C4 (friction log) is still maintained — it becomes the artifact Datagrok inherits when they later restart W1.

---

## Sequencing

```
Week 0   ──  Kickoff
              ├── W1.A5 (governance + owners assigned)
              ├── W2 (Lattice donation table filled)
              └── Path B confirmed; week-4 gate criteria agreed
                                │
Weeks 1-4  ──  1-month gate window
              W1 work in parallel:
                ├── A1 v0.1 (≥10 entries)              <- Datagrok platform team
                ├── A2 v0.1 (≥15 typed facts)          <- Datagrok platform team
                ├── B1 (query script)                  <- Datagrok harness owner
                ├── B2 (cycle workflows)               <- Datagrok harness owner
                ├── B3 partial (scaffold skeleton)     <- Datagrok harness owner
                └── B5 partial (hook wiring)           <- Datagrok harness owner
              W3:
                └── Larisa observes; spikes optional   <- Larisa
                                │
Week 4   ──  GATE
              Path B passes? continue.
              Path B fails?   Path A activates.
                                │
        ─────────────────┬──────────────────
       Path B continues  │  Path A activates
                         │
Phase 2  ──  Pilot port  │  Independent port
  W1:                    │  W1: continues at Datagrok pace
   ├── A1 v0.2           │  W3:
   ├── A2 v0.2           │   ├── C1, C2, C3 against
   ├── B4 (Datagrok      │   │   existing inefficient flow
   │   skills, AFTER C1) │   ├── C4 friction log
   └── A3 starts         │   └── C5 deferred to whenever
  W3:                    │       W1 lands; rework cost
   ├── C1 spike          │       absorbed at re-alignment
   ├── C2 plan           │
   ├── C3 iterative      │  Sister app re-decides W1
   └── C4 friction log   │  participation later.
                         │
Phase 3  ──  Generalize  │
  W1:                    │
   ├── A3, A4 land        │
   ├── B6 merge plan     │
   └── Onboarding docs   │
  W3: C5 finishes        │
                         │
Phase 4  ──  Plugin #2   │
  Pick second pilot;     │
  validate harness       │
  generalizes.           │
```

**Critical path under Path B:** A5 → A1 v0.1 + A2 v0.1 → C1 → A1 v0.2 → C5.

**Phase 4 (plugin #2) matters for the team's adoption decision.** Validating that the harness generalizes to a non-scientific plugin (chemoinformatics? chembl? something other than SENDEX-shape) is what prevents the harness from becoming SENDEX-shaped accidentally.

---

## Roles & responsibilities

Names TBD; assigned at kickoff (counted toward week-4 gate criterion).

| Role | Owns | Workstreams | Suggested ownership |
|------|------|-------------|---------------------|
| **Harness Architect** | Overall coherence; A5 governance; decides the integration shape (W2) | W1.A5, W2 | Datagrok core team lead |
| **Platform Knowledge Owner** | A1, A2 are authoritative; absorbs friction-log feedback | W1.A1, W1.A2 (v0.x cadence) | Datagrok core team — API maintainer or someone with read-authority across `js-api/` and `libraries/` |
| **Platform Tooling Owner** | `grok check` evolution; CI hooks | W1.A3, W1.A4 | Datagrok tools team |
| **Harness Integrator** | Lattice ↔ Datagrok wiring; cycle adapters; scaffold | W1.B1, B2, B3, B4, B5 | Datagrok engineer; could shadow Larisa for first 2 weeks |
| **Pilot Plugin Owner** | SENDEX port; friction log feedback | W3.C1-C5 | Larisa |
| **Lattice Liaison** | Donation explanations; adaptation advisory | W2 | Larisa |

The **Harness Integrator** role is the one that goes unowned by default. Assign it explicitly at kickoff. Without an owner, W1.B items don't move and the gate fails.

---

## Open questions for kickoff

1. **Who is the Harness Architect?** A5 needs an owner before everything else can be assigned.
2. **What's the Lattice integration shape?** Fork, vendor, or inspire. Drives W2 and the merge-cadence question.
3. **Where does the harness repo live?** `datagrok-ai/dev-harness` (suggested) or inside `datagrok-ai/public`. Determines visibility, contributor model.
4. **What's the budget for the 1-month gate window?** Roughly 2 engineers part-time across W1.A1, A2, B1-B3 + governance. Acceptable?
5. **How does A1/A2 version with Datagrok core releases?** Lockstep (semver-coupled) or independent?
6. **Plugin author feedback channel — what shape?** Slack? GH issues on the harness repo? `harness/feedback/`?
7. **Plugin #2 — when to pick, and which?** Affects Phase 4. Helpful to identify before kickoff so it's clear the harness is being built for *more than* SENDEX.
8. **What of Lattice's scientific layer (algorithm-defensibility, validation ratchet, NOAEL-shape methods knowledge) is in scope?** Probably not platform; possibly an optional plugin-author-facing lib for analytical plugins. Decision for Phase 3.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 1-month gate fails because of bandwidth, not commitment | High | Path A activates; harness work continues but without forcing function | Bandwidth needs to be agreed at kickoff. If the team can't commit ~2 engineers part-time for 4 weeks, restructure the gate. |
| Owners assigned at kickoff but don't materially work in weeks 1-3 | Medium | Same as above | Weekly check-in (15 min) starting week 1; surfaces lack of progress before week 4 |
| W1.A1 / A2 authored under time pressure produce wrong canonical entries | Medium | Plugin authors build on wrong foundations | Confidence-tag every entry (`platform-confirmed` / `inferred-from-source` / `inferred-from-pattern`); harvest the SENDEX friction log to upgrade tags |
| Lattice donation table picks "inspire" everywhere | Medium | Largest ongoing duplication; Larisa carries Lattice maintenance alone | Per-item rationale documented at A5; revisit at Phase 4 if duplication cost exceeds the integration cost |
| SENDEX port (W3) reveals SENDEX-shaped assumptions in W1 that don't generalize | Medium | Plugin #2 work breaks; harness becomes SENDEX-shaped accidentally | Pick plugin #2 early (open question 7); design W1 against both forcing functions, not just SENDEX |
| Platform team's existing dev process resists the harness | Medium | Adoption stalls inside the team itself | A5 explicit conversation: is the harness for plugin authors only, or for core devs too? |
| Larisa underestimates SENDEX port effort once it starts | Medium | Phase 2 / 3 stretch | Accept and re-plan; the harness work continues regardless |

---

## What this doc is, and what it isn't

**It is** the kickoff scaffold for the meeting. The point: drive the meeting from the structure here, edit during/after, then execute against the resulting version.

**It isn't** a contract. The 1-month gate criteria are the closest thing to one — those are sharper than the rest because they're how Larisa decides whether to keep waiting or trigger Path A.

**Owner of this doc:** the Harness Architect (TBD, A5). Updates land via PR; living doc, not snapshot.

---

## Appendix

- [Lattice — README](../README.md)
- [Lattice — workflow](../WORKFLOW.md)
- [Lattice — enforcement layer](../ENFORCEMENT.md)
- Datagrok public repo — `js-api/`, `packages/`, `help/develop/`
- SENDEX (pilot plugin) — `C:/pg/pcc/`
