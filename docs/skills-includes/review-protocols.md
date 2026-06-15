# Review Protocols (partner file to `commands/lattice/review.md`)

> **Not a skill.** Sited outside `commands/` so it is not auto-discovered as a skill. This file is included by reference from `review.md` Step 3b.
>
> Contains the detailed protocols that `review.md` and the cycle / gate skills keep short. Two groups:
>
> **Review-time mechanical protocols** (run by `review.md` MECHANICAL CHECKS, one PASS / FAIL / SKIPPED line each):
> - `## VISUAL` — Playwright navigation, screenshot, interaction smoke test.
> - `## DATA` — empirical-claim verification against generated JSON.
> - `## TRIANGLE` — contract-triangle synchronization audit (CLAUDE.md rule 18).
> - `## ALGORITHM` — algorithm-output defensibility on representative data (CLAUDE.md rule 19).
>
> **Design-intent conformance protocols** (run by `synthesize` / `blueprint-cycle` / `build-cycle` / `design` and the `architect-reviewer` / `post-impl-reviewer` agents — NOT by `review.md` MECHANICAL CHECKS; concrete oracle map + disposition in the project design-intent rule, pcc CLAUDE.md rule 27):
> - `## PRIMITIVE` — does a reused primitive compute the asserted quantity at the asserted grain (read the body, never the emitted artifact). Leg B.
> - `## LOCUS` — is the science computed where it belongs (backend computes, UI projects). Leg C.
> - `## CONFORMANCE` — does every surface element bind to the four design-intent oracles at the right grain. Leg A + the binding contract.
>
> Skills invoke these by section heading. The review-time group emits one line per protocol with PASS / FAIL / SKIPPED, in the format documented at the bottom of this file.

---

## When to run each protocol

| Protocol | Trigger |
|---|---|
| VISUAL | Diff contains any `.tsx`, `.ts` under `src/`, or `.css` |
| DATA | Spec contains any cardinality / numeric / "shows X" claim, OR diff consumes generated output |
| TRIANGLE | Diff modifies an enum constant, JSON schema, Pydantic model, TS type union, contract-doc table row, or pytest invariant over generated JSON |
| ALGORITHM | Diff modifies OR consumes the output of a path matching `.lattice/algorithm-paths.txt` (default paths below if file is absent) |
| PRIMITIVE | A spec / plan reuses or depends on any reuse anchor (`file.ext:LINE`), OR a path in `.lattice/algorithm-paths.txt` |
| LOCUS | A frontend diff renders an analytical value (classification / threshold / score / severity), OR a spec proposes one |
| CONFORMANCE | A spec / synthesis / diff introduces or modifies a surface element (column / role / badge / chip / cell) |

Default ALGORITHM paths if `.lattice/algorithm-paths.txt` does not exist:
`**/derive-summaries.ts`, `**/endpoint-confidence.ts`, `**/findings-rail-engine.ts`, `**/cross-domain-syndromes.ts`, `**/syndrome-rules.ts`, `**/services/analysis/**/*.py` (when the file mentions NOAEL/LOAEL/scoring/classification keywords).

---

## VISUAL

**Question answered:** "did the page render without errors?"

### Prerequisites

- Frontend dev server running (default: `http://localhost:5173`)
- Backend running (default: `http://localhost:8000`) if views need data
- Playwright MCP server configured in `.mcp.json`

If prerequisites aren't met, attempt to detect them:
1. `browser_navigate` to the app URL — if it fails on first attempt, retry ONCE. If second attempt fails, state: `VISUAL: SKIPPED — Playwright unreachable after retry` and fall back to DATA. Do NOT mark the review blocked on first failure.
2. If only the backend is down, views may show loading/error states — note this in the output, don't count it as a UI failure.

### Step 1: Map changes to views

Read the changed frontend files and determine which view(s) / route(s) they affect. Examples:

- `FindingsView.tsx` changed → navigate to the Findings view
- `DoseResponseChartPanel.tsx` changed → navigate to a view that renders it
- `severity-colors.ts` changed → check multiple views (shared utility)
- `lib/` utility changed → check the primary consumer

If you can't determine the route, navigate to the app root and verify it loads.

### Step 2: Navigate and screenshot

For each affected view:

1. **`browser_navigate`** to the view URL.
2. **`browser_console_messages`** — check for JavaScript errors. Errors originating from changed files = FAIL.
3. **`browser_take_screenshot`** — save for user review. State the screenshot path in output.
4. **`browser_snapshot`** (accessibility tree) — verify:
   - The view rendered (not blank, not stuck on loading spinner, not showing error boundary).
   - Key data elements are present (tables have rows, charts have content, rails have items).
   - No `undefined`, `NaN`, `[object Object]` visible in data displays.

### Step 3: Interaction smoke test

If the changeset modifies **click handlers, hover behavior, selection logic, or toggle/filter state**:

1. Identify the primary interaction the change affects.
2. Execute it via `browser_click` or `browser_hover`.
3. Take a second screenshot or snapshot — verify the expected response occurred (panel updated, selection changed, tooltip appeared, series toggled).

Skip this step if the change is purely presentational (styling, labels, layout).

### Step 4: Multi-view check (shared code only)

If the changed file is consumed by 3+ views (utilities in `lib/`, shared components):

- Navigate to at least 2 different views that use the changed code.
- Verify both render correctly.

### Anti-patterns

- **Do not treat "Visual verification required by user" as an acceptable output when Playwright MCP is available.** That phrasing is a legacy escape hatch from before agents had browser access. If the MCP tools are available and the dev server is running, USE THEM. Only fall back to user verification when the tools genuinely cannot be used (server down, MCP not configured). On first failure, retry ONCE before giving up.
- **Do not mark VISUAL: SKIPPED without also running DATA.** Playwright unreachable is not a reason to skip everything. DATA requires only the generated JSON and a Python interpreter, both of which are always available in this environment.

---

## DATA

**Question answered:** "does the data say the page SHOULD have content?"

DATA is INDEPENDENT of VISUAL. Playwright tells you "did it render", DATA tells you "should it have content at all". Run both.

### When to run

- The spec contains any claim of the form "count is X", "≤ N rows", "shows the fragile subjects", "matches the chart", or similar cardinality/content assertion.
- Any time Playwright is unavailable — DATA is the mandatory fallback, not SKIPPED.
- Any review of frontend code that consumes generated output (findings, analytics, scoring).

### How to run

1. Identify every empirical claim in the spec. Copy the exact wording.
2. For each claim, load the relevant `backend/generated/{study}/unified_findings.json` (or other generated file) and compute the actual value.
3. Compare observed vs expected. Cite both.
4. If the observed value doesn't match, flag as `DATA: FAIL — spec says X, observed Y` and block the commit until resolved.

### Forms that satisfy this protocol

- A fixture-based test that loads real generated output (preferred — runs in CI going forward). See `frontend/tests/loo-sensitivity-pane-logic.test.ts` "PointCross BW data fixture" describe block for the pattern.
- A Python one-liner recorded in the review output: `backend/venv/Scripts/python.exe -c "import json; ..."` with the actual printed value shown.
- `/ops:explore-data` with the specific question from the spec.

### Forms that do NOT satisfy

- Mirror-pattern unit tests (they test code-vs-spec, not code-vs-reality).
- "I read the code and it looks right" — the bug that motivated this rule shipped with correct-looking code.
- "The build passes" — build catches type/syntax errors, not empirical mismatches.
- "Playwright rendered the page without console errors" — a blank chart has no console errors.
- **Do not substitute mirror tests for DATA.** Mirror tests pass when code matches spec text; DATA catches the spec-vs-reality gap. They are complementary, not alternatives. The loo-display-scoping cycle (2026-04-07) had 20 passing mirror tests AND shipped an empty chart because nobody ran the spec's count claim against real data.

---

## TRIANGLE

**Question answered:** "is the contract field synchronized at declaration / enforcement / consumption?"

CLAUDE.md rule 18 ("Contract triangle hygiene") is the authority. This protocol is the audit-script invocation that enforces it. Read CLAUDE.md rule 18 verbatim for the rule statement; do not reproduce it here.

### Audit-script invocation

```bash
cd <project-root> && python scripts/audit-contract-triangles.py
```

The script:
1. Parses `docs/_internal/knowledge/contract-triangles.md` for triangles with explicit `Vocabulary: {...}` declarations.
2. Verifies every cited file:line still resolves.
3. Scans the registered scan directories for proper-subset literals (e.g., a 3-value `{adverse, warning, normal}` literal where the canonical vocabulary is 4-value) — the BFIELD-21 straggler shape.
4. Diffs against `scripts/data/triangle-audit-baseline.txt` — only NEW stragglers fail the check; pre-existing ones in the baseline are tracked tech-debt.

Exit code 0 = PASS; 1 = FAIL with new stragglers; 2 = config error (registry missing/unparseable).

### Resolving NEW stragglers

If the script reports NEW stragglers, walk each and either:

- Fix it (widen the subset to match the canonical vocabulary), OR
- Add `triangle-audit:exempt -- <rationale>` on the line if the subset is intentionally narrower (e.g., a sub-enum like BFIELD-27's `SEVERITY_NO_NORMAL`), OR
- Run `python scripts/audit-contract-triangles.py --write-baseline` to accept the new state — but only after explicit triage and with the triage rationale in the commit body.

### Registry maintenance

If the diff introduced a new contract field (new enum value, new BFIELD), require a new row in `contract-triangles.md` with declaration / enforcement / consumption sites. If site count grew on an existing triangle, update the row.

The TRIANGLE protocol supersedes Step 2a's reuse audit for contract fields specifically — the reuse audit asks "is this duplicated"; the triangle check asks "is this synchronized."

A TRIANGLE FAIL is a hard block — silent declaration / enforcement / consumption divergence is exactly the bug class CLAUDE.md rule 18 exists to prevent.

---

## ALGORITHM

**Question answered:** "would a regulatory toxicologist agree the algorithm's output represents the data?"

CLAUDE.md rule 19 ("Algorithm defensibility on real data") is the authority. Read it verbatim for the rule statement and the SCIENCE-FLAG-clearing protocol; do not reproduce it here.

ALGORITHM is distinct from DATA. DATA asks "does the spec's claim match what the code produces"; ALGORITHM asks "does what the code produces match what the *data* warrants from a tox-reviewer's perspective". A spec can be wrong; a code can match the spec; an algorithm can still produce an indefensible answer.

### How to run

For each algorithm touched by the diff (or consumed by the diff's UI changes):

1. Identify the algorithm's input data shape and where representative data exists (`backend/generated/{study}/unified_findings.json`).
2. Run the algorithm against PointCross + at least one other representative study (Nimble, PDS, or another with the relevant domain populated).
3. Record the actual output: NOAEL value + tier, LOAEL dose level, score value + classification, syndrome detection result, severity assignment.
4. Answer in writing: **"Would a regulatory toxicologist agree this output represents the data?"** with a one-paragraph interpretation citing the actual pairwise/group values that drove the result.

### Forms that satisfy

- Python one-liner recorded in the review output, replicating the algorithm's logic against the JSON, with the printed output cited verbatim. See BUG-031 retrospective for a worked example.
- A new fixture-based test that runs the algorithm against real generated output and asserts the defensible result. Strongly preferred — it carries the check forward in CI.
- `/ops:explore-data` with the specific algorithm question.

### Forms that do NOT satisfy

- "The function passes its unit tests" — unit tests verify the function does what its mock inputs say it should do.
- "The build passes" / "lint passes" / "all 2051 tests pass" — none verify algorithmic defensibility.
- "The spec says this is the expected output" — the spec itself may be wrong (BUG-031: spec author treated the indefensible output as the desired outcome).
- "The change is downstream of the algorithm" — if the diff CONSUMES the algorithm's output, you still need to verify that the output is defensible. Shipping a UI that displays an indefensible NOAEL more consistently is worse than shipping inconsistent UIs that hide it.

### FAIL handling

ALGORITHM: FAIL is a hard block. The fix is to escalate (ESCALATION.md) and revert the consumer change — do NOT ship a UI that locks in the indefensible output. See BUG-031 for the canonical example.

A SCIENCE-FLAG raised by any review agent on algorithmic grounds clears only via the three paths in CLAUDE.md rule 19: (i) fix, (ii) data-grounded counter-evidence in the rule-19 format, (iii) explicit user defer with named dependency. Plumbing-only rebuttals do NOT clear it.

---

## PRIMITIVE

**Question answered:** "does the reused primitive compute the asserted quantity at the asserted grain?"

Leg B of the design-intent contract. The authority for the source-read obligation is CLAUDE.md rule 19 (algorithm defensibility — the *source*, not only its output) and rule 5 (consumption = import the symbol **at the asserted grain**). The artifact a primitive emits is **never** evidence about what the primitive computes — the artifact reflects what the *caller* wired in.

### When to run

- Any spec / plan that cites a reuse anchor (`file.ext:LINE`) or otherwise depends on an existing function.
- Any dependency on a path in `.lattice/algorithm-paths.txt`.
- Both phases: at **blueprint** time against the anchor list; at **build / review** time against the actual call sites in the diff.

### How to run

For every reused / depended-on primitive:

1. Open the **function body** — not the signature, not the call site's comment, not the emitted JSON.
2. Record: its **inputs**; its **grain** (per-subject / per-syndrome / per-organ / aggregate / **grain-agnostic**); which args are **optional** (and their defaults); and **what the caller must supply that the function does not enforce**.
3. State whether the primitive **guarantees** the asserted quantity-at-grain, or whether the grain is **caller-selected**. If caller-selected, read the actual call site to see which selection it makes.
4. FAIL when the asserted grain is contradicted by the body — e.g. a "syndrome-scoped" claim against a function whose syndrome arg is a passthrough label used in no computation, or whose discriminator arg defaults to a grain-agnostic path.

### Forms that satisfy

- A recorded body-read: inputs / grain / optional-args / caller-must-supply, citing the function's `file:line`.
- Canonical incident shape: "`resolve_position` (`animal_position.py:99-187`) is grain-agnostic — `syndrome_members` optional (default `None` → all endpoints weight 1), `syndrome_id` a passthrough label used in no computation; grain selected by the caller's endpoint set."

### Forms that do NOT satisfy

- "the emitted artifact shows X" — the artifact reflects what the **caller** wired in, not what the primitive guarantees (the exact `per-animal-evidence-table` failure).
- "the symbol exists / is imported" / "`file:line` resolves" — presence is not grain.
- "the spec says the primitive is syndrome-scoped" — the spec may have read the grain off the artifact.

### FAIL handling

PRIMITIVE: FAIL on a grain contradiction is a hard block — the ground-truth-of-MEANING defect. Mechanical companion: `REUSE-ANCHOR-GRAIN` in `scripts/audit-spec-reuse.py` (blocks when an anchored function with an optional discriminator is called with it omitted).

---

## LOCUS

**Question answered:** "is the science computed where it belongs?"

Leg C of the design-intent contract. The authority is the project's compute-locus invariant (pcc: backend-computes / frontend-projects — the GAP-393 dual-engine boundary). LOCUS is distinct from DATA and PRIMITIVE: not "is the value right" but "is the value computed in the right **layer**."

### When to run

- A frontend diff renders an analytical value.
- A spec proposes a UI surface that **derives**, rather than displays, an analytical value.

### How to run

1. Trace every analytical value the UI displays to its origin.
2. FAIL when the value is computed in TS but the backend already emits it, OR it is a domain computation that belongs in the engine per the compute-locus invariant.

**"Analytical value" by example (the trigger boundary):**

- **Analytical → belongs in the backend:** classification / verdict assignment; threshold comparison or re-derivation (e.g. a `1.1×` fold-change cutoff); statistical-test or slope re-application; severity / tier assignment; cross-domain aggregation or scoring.
- **NOT analytical → fine in TS:** string truncation; number formatting (`toFixed`, unit suffixing); label construction; sort / filter of already-computed values; color-mapping a value the backend already classified.
- **When in doubt** (a borderline aggregation), flag it and let the architect adjudicate.

### Forms that satisfy

- A per-value origin trace: each displayed analytical value mapped to the backend field / emitter that produces it, OR an explicit note that nothing analytical is computed in the UI (it projects).

### Forms that do NOT satisfy

- "the TS value matches the backend value" — that it matches **today** is luck; the locus is still wrong and will drift. Canonical example: the `CohortEvidenceTable.tsx:455-464` `1.1×` heuristic — a frontend re-invention of a backend domain computation.

### FAIL handling

LOCUS: FAIL is a hard block — ship the computation in the backend and have the UI project it; do not lock in a frontend re-derivation.

---

## CONFORMANCE

**Question answered:** "does every surface element bind to the four design-intent oracles, at the right grain?"

Leg A + the binding contract. The **concrete oracle map** (which file backs each binding) and the **disposition-on-miss** are owned by the project design-intent rule (pcc: CLAUDE.md rule 27) — read it for the project specifics; this protocol is the generic mechanism. CONFORMANCE **composes with** (does not replace) rule 17 (spec-value-audit, the isolation / scope-creep axis); CONFORMANCE is the relational / semantic-grain axis.

### When to run

Any spec / synthesis / diff that introduces or modifies a surface element (column / role / badge / chip / cell).

### How to run

1. **DE-NOMINATE (the discovery half).** The reviewing agent reads the **staged diff / the plan's proposed-modifications list** and *enumerates every surface element it introduces or modifies*. This diff-read does **not** depend on the author having recognized the element — it is what puts an un-flagged chip on the checklist. It *finds* elements the author never declared; it does not confirm a known list.
2. **CROSS-CHECK against the author's intent header (the declaration half).** Compare the diff-derived enumeration against the spec's Surface Intent Header per-element table. An element present in the diff / plan but **absent from the header** is a **FAIL** (undeclared element).
3. **RESOLVE the four bindings** for each element (concrete oracles per the project rule):

   | Binding | Question | Disposition on miss |
   |---|---|---|
   | what it IS | semantic definition + GRAIN (project typed knowledge-graph fact + role oracle) | untyped load-bearing semantic → promote the typed fact FIRST (inline prerequisite) |
   | why it's HERE | which reader question it serves (a reader-question oracle ID) | serves none → ROT, cut it |
   | at what UNIT | the grain it is computed at (unit-of-analysis / substrate-axis declaration) | wrong unit = wrong, not uncertain; **this row mandates the PRIMITIVE read** (it does not by itself refute the grain) |
   | reaches what | which capability node it unblocks (a capability-reachability node) | new dimension → promote a new node FIRST |

   An element with an **unresolved binding** is a **FAIL**.

> **Promote-first is an INLINE prerequisite, not a deferred queue entry.** When a binding misses (untyped semantic / new dimension / serves-no-question), resolve it *within the same cycle* — promote the typed fact / promote the node / cut the element — then the binding resolves. It does **not** enter a prioritization queue to be ranked later.

> **The oracle is not self-certifying (load-bearing).** Binding the *what-it-IS* row to an oracle that itself carries an emission-grain framing **surfaces** the ambiguity, it does not **refute** it. Closure is three steps, distinct roles: (1) **DE-NOMINATE** enumerates the element independent of author recognition (closes the meta-failure); (2) the **at-what-UNIT** row requires a declared grain, which *mandates* the PRIMITIVE read (the UNIT row alone does not refute — a wrong-grain unit would still pass the binding check); (3) the **PRIMITIVE** source-read *refutes* the wrong grain. The refutation is step 3; steps 1–2 guarantee step 3 happens on an element the author never flagged.

### Phase-dependence

- **Build / review time:** the diff is **code-level** — the agent reads the actual rendering code, fully author-independent (the strongest form; `audit-design-intent.py` + the post-impl reviewer run here).
- **Blueprint time:** there is no code diff — the input is the synthesis's **Section-1d per-element table**, which MUST describe each UI surface's elements *at element grain* (a file path alone does not enumerate elements). The architect cross-checks 1d against the proposed-modifications list + `.lattice/algorithm-paths.txt`; an under-specified 1d fails the gate *for under-specification*. At this phase the gate's contribution is to **correct the fix-direction** (an enumerated chip routes to a PRIMITIVE read instead of escaping as "advisory / no flag").

### Forms that satisfy

- A per-element table (diff-enumerated, cross-checked against the header) with all four bindings resolved, plus a PRIMITIVE row for any element whose UNIT binding mandates a source-read.

### Forms that do NOT satisfy

- An author-populated intent header **alone** (without the agent's diff-read) — the declaration half does not guarantee completeness (the incident author wrote a 14-anchor reuse inventory and still omitted the position chip).
- Binding the what-it-IS row to the oracle text **without** the mandated PRIMITIVE read — a wrong-grain unit passes the binding check; only the source-read refutes it.

### FAIL handling

CONFORMANCE: FAIL (undeclared element, unresolved binding, or a UNIT-mandated PRIMITIVE read not performed) is a hard block at the gate that runs it. Mechanical companion: `scripts/audit-design-intent.py` validates the bindings of the *listed* elements; the diff-vs-header completeness cross-check is the agent's job — the audit cannot generate scope (same as `audit-todo-serves.py` validates entries but does not discover them).

---

## Output format (used by `review.md` MECHANICAL CHECKS)

`review.md` appends one block per protocol to the MECHANICAL CHECKS section:

```
VISUAL: PASS — [view name(s)] render correctly, no console errors, [N] interactions verified
VISUAL: FAIL — [specific issue: console error in X / blank render / broken interaction]
VISUAL: SKIPPED — [reason: no frontend changes / Playwright unreachable after retry]

DATA: PASS — [N] empirical claims verified against generated JSON
  - "{exact spec quote}" -> observed {value}, cited {file:line or command}
  - ...
DATA: FAIL — [spec claim X] says {expected}, observed {actual} in {file}
DATA: SKIPPED — [reason: no empirical claims in spec / no generated JSON for verification]

TRIANGLE: PASS — [N] contract triangles touched, all three sites updated in this commit
  - {field}: declaration={file:line}, enforcement={file:line}, consumption={file:line list}
  - ...
TRIANGLE: FAIL — [field] modified at {site} but {other site(s)} still reference old vocabulary
TRIANGLE: SKIPPED — no contract surface modified

ALGORITHM: PASS — [N] algorithms verified defensible on representative data
  - {algorithm} on {study}: observed {output}, tox interpretation: "{one-paragraph rationale}"
  - ...
ALGORITHM: FAIL — {algorithm} on {study} produces {output}; tox-indefensible because {reason}. Escalating.
ALGORITHM: SKIPPED — no algorithmic code touched (no path match against .lattice/algorithm-paths.txt)

PRIMITIVE: PASS — [N] reused primitives body-read, grain confirmed
  - {primitive} ({file:line}): grain={...}, optional args={...}, caller-must-supply={...}
PRIMITIVE: FAIL — {primitive} asserted {grain} but body computes {actual}; {arg} is a passthrough / optional default
PRIMITIVE: SKIPPED — no reuse anchor or algorithm-path dependency in this change

LOCUS: PASS — [N] displayed analytical values trace to backend emitters (UI projects)
  - {value}: emitted by {backend file:field}
LOCUS: FAIL — {value} computed in {TS file:line}; belongs in backend ({backend already emits it / domain computation})
LOCUS: SKIPPED — no analytical value rendered in a frontend diff

CONFORMANCE: PASS — [N] surface elements enumerated by diff-read, all bound to the four oracles
  - {element}: IS={fact-id}, HERE={Q-*}, UNIT={grain}, REACHES={RN-*}[, PRIMITIVE: {grain confirmation}]
CONFORMANCE: FAIL — {element} {absent from header / unresolved {binding} / UNIT-mandated PRIMITIVE read not performed}
CONFORMANCE: SKIPPED — no surface element introduced or modified
```

Include screenshot path(s) so the user can inspect the visual. Include the cited JSON path and observed values for DATA. **VISUAL FAIL does not auto-block. DATA FAIL, TRIANGLE FAIL, and ALGORITHM FAIL all auto-block.** PRIMITIVE FAIL (grain contradiction), LOCUS FAIL (wrong compute-layer), and CONFORMANCE FAIL (undeclared element / unresolved binding / un-performed UNIT-mandated read) auto-block at the gate that runs them.
